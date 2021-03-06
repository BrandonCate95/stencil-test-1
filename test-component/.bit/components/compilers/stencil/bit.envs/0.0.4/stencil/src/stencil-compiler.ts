import { Compiler, InitAPI, CompilerContext, Logger, ActionReturnType } from "@bit/bit.envs.common.compiler-types";
import { compile } from './compile'


export class StencilCompiler implements Compiler {
    private _logger: Logger | undefined

    init(ctx: { api: InitAPI }) {
        this._logger = ctx.api.getLogger()
        return {
            write: true
        }
    }

    getDynamicPackageDependencies(ctx: CompilerContext, name?: string) {
        return {}
    }

    async action(ctx: CompilerContext):Promise<ActionReturnType> {
        const compileResult = await compile(ctx, ctx.context.rootDistDir, ctx.context)
        return compileResult
    }

    get logger(): Logger | undefined {
        return this._logger
    }
}

