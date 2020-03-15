import { Component, Prop, h } from '@stencil/core';

@Component({
  tag: 'test-component',
  styleUrl: 'test-component.css',
  shadow: true
})
export class MyComponent {
  /**
   * The first name
   */
  @Prop() first: string;

  render() {
    return <div>My First name is: {this.first}</div>;
  }
}
