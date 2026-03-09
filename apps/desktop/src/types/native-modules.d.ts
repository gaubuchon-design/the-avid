// ═══════════════════════════════════════════════════════════════════════════
//  Native Module Stubs
//  Minimal type declarations for optional native modules that may not be
//  installed. These modules are dynamically imported and cast to internal
//  types at runtime, so only a basic module declaration is needed.
// ═══════════════════════════════════════════════════════════════════════════

declare module 'serialport' {
  const mod: any;
  export = mod;
}

declare module 'grandiose' {
  const mod: any;
  export = mod;
}

declare module '@eyevinn/srt' {
  const mod: any;
  export = mod;
}

declare module 'aja-ntv2' {
  const mod: any;
  export = mod;
}

declare module 'macadam' {
  const mod: any;
  export = mod;
}
