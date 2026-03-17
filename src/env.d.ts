/// <reference types="astro/client" />

declare module '*.glsl?raw' {
  const value: string;
  export default value;
}
