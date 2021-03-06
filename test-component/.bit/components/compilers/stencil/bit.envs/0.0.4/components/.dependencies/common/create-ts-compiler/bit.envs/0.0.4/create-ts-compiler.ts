
import path from 'path'
import execa from 'execa'
import readdir from 'recursive-readdir'
import Vinyl from 'vinyl'
import { promises as fs, Stats } from 'fs'
import { GenericObject, CompilerContext } from './compiler-types';

const DEBUG_FLAG = 'DEBUG'
import { getCapsuleName } from './get-capsule-name';

export interface CompilationContext {
    directory: string
    name: string,
    main: string,
    dist: string,
    dependencies: GenericObject,
    capsule: GenericObject,
    res: GenericObject
}

export type RunCompiler = (ctx:CompilationContext) => Promise<void>
export type PreCompile = (ctx:CompilationContext, options:GenericObject) => Promise<void>
export type IgnoreFunction = (file: string, stats: Stats) => boolean 

const defaultIgnoreFunction = function (file:string, stats: Stats){
    return !~file.indexOf('/node_modules/') || 
          !!~file.indexOf('/dist/')         || 
          !!~file.indexOf('.dependencies') 
}


export function createCompiler(preCompile:PreCompile, runCompiler:RunCompiler, ignoreFunction = defaultIgnoreFunction){
    return async (cc:CompilerContext, distPath: string, api: GenericObject, extra: { fileTypes: string[], compilerOptions: GenericObject }) => {
        const { res, directory } = await isolate(api)
        const context = await createContext(res, directory, distPath)
        let results = null
        preCompile(context, extra.compilerOptions)
        if (getNonCompiledFiles(cc.files).length === cc.files.length) {
            const dists = await collectNonDistFiles(context, ignoreFunction)
            results = {dists}
        } else {
            results = await _compile(context, cc, runCompiler, ignoreFunction)
        }
    
        if (!process.env[DEBUG_FLAG]) {
            await context.capsule.destroy()
        }
    
        return results
    }
}

async function _compile(context: CompilationContext, cc:CompilerContext, runCompiler:RunCompiler, ignoreFunction:IgnoreFunction) {
    await runCompiler(context)
    const dists = await collectDistFiles(context)
    const nonCompiledDists = await collectNonDistFiles(context, ignoreFunction)
    const mainFile = findMainFile(context, dists)
    return { dists: dists.concat(nonCompiledDists), mainFile }
}

function getNonCompiledFiles(files:Vinyl[]) {
    return files.filter((f) => {
        return !f.basename.endsWith('ts') && !f.basename.endsWith('tsx')
    })
}

export function findMainFile(context: CompilationContext, dists: Vinyl[]) {
    const compDistRoot = path.resolve(context.directory, 'dist/')
    const getNameOfFile = (val:string, split:string) => val.split(split)[0]
    const sourceFileName = getNameOfFile(context.main, '.ts')
    const pathPrefix = `${compDistRoot}${compDistRoot.endsWith('/') ? '':'/'}`
    const distMainFileExt = '.js'
    const res = dists.find((val)=> {
        if (!val.path.endsWith(distMainFileExt)) {
            return false;
        }
        const nameToCheck = getNameOfFile(val.path, distMainFileExt).split(pathPrefix)[1]
        return sourceFileName.endsWith(nameToCheck);
    })
    return  (res || {relative:''}).relative
}

function createContext(res: GenericObject, directory: string, distPath: string): CompilationContext {
    const componentObject = res.componentWithDependencies.component.toObject()
    return {
        main: componentObject.mainFile,
        dist: distPath,
        name: componentObject.name,
        dependencies: getCustomDependencies(directory),
        capsule: res.capsule,
        directory,
        res
    }
}

export async function runNodeScriptInDir(directory: string, scriptFile: string, args: string[]) {
    let result = null
    const cwd = process.cwd()
    try {
        process.chdir(directory)
        result = await execa(scriptFile, args,{stdout:1})
    } catch (e) {
        process.chdir(cwd)
        throw e
    }
    process.chdir(cwd)
    return result
}


export async function createTSConfig(context: CompilationContext, content: GenericObject) {
    const pathToConfig = getTSConfigPath(context)
    content.compilerOptions.outDir = 'dist'
    return fs.writeFile(pathToConfig, JSON.stringify(content, null, 4))
}

async function isolate(api: GenericObject) {
    const targetDir = getCapsuleName();
    const componentName = api.componentObject.name
    print(`\n building ${componentName} on directory ${targetDir}`)

    const res = await api.isolate({ targetDir, shouldBuildDependencies: true })

    return { res, directory: targetDir }
}

async function collectDistFiles(context: CompilationContext): Promise<Vinyl[]> {
    const capsuleDir = context.directory
    const compDistRoot = path.resolve(capsuleDir, 'dist')
    const files = await readdir(compDistRoot)
    const readFiles = await Promise.all(files.map(file => {
        return fs.readFile(file)
    }))
    return files.map((file, index) => {

        const pathToFile = path.join(compDistRoot, file.split(path.join(capsuleDir, 'dist'))[1])
        return new Vinyl({
            path: pathToFile,
            contents: readFiles[index],
            base: compDistRoot
        })
    })
}

async function collectNonDistFiles(context:CompilationContext, ignoreFunction:IgnoreFunction): Promise<Vinyl[]> {
    const capsuleDir = context.directory
    const compDistRoot = path.resolve(capsuleDir, 'dist')
    const fileList = await readdir(capsuleDir, ['*.ts', '*.tsx', ignoreFunction])
    const readFiles = await Promise.all(fileList.map(file => {
        return fs.readFile(file)
    }))
    const list = fileList.map((file, index) => {
        const pathToFile = path.join(compDistRoot, file.split(capsuleDir)[1])

        return new Vinyl({
            path: pathToFile,
            contents: readFiles[index],
            base: compDistRoot
        })
    })

    return list
}


function getTSConfigPath(context: CompilationContext) {
    return path.join(context.directory, 'tsconfig.json')
}

function getCustomDependencies(dir: string) {
    return Object.keys(require(`${dir}/package.json`).dependencies || {})
}

function print(msg: string) {
    process.env[DEBUG_FLAG] && console.log(msg)
}