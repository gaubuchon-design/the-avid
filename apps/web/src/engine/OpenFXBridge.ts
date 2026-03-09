// =============================================================================
//  THE AVID -- OpenFX (OFX) Host Bridge
// =============================================================================
//
//  Renderer-side bridge between the app's effect system and native OpenFX 1.5
//  plugins. The actual native loading runs in Electron's main process; this
//  file defines the IPC protocol, type system, suite stubs, and conversion
//  logic used on the renderer side.
//
//  Functions that depend on native code are marked with @desktopOnly.
// =============================================================================

import {
  type EffectDefinition,
  type EffectParamDef,
  type EffectInstance,
  type Keyframe,
  effectsEngine,
} from './EffectsEngine';

// =============================================================================
//  1. OFX Type Definitions (OpenFX 1.5 Spec)
// =============================================================================

// ─── Status Codes ───────────────────────────────────────────────────────────

export const enum OFXStatus {
  OK                  = 0,
  Failed              = 1,
  ErrFatal            = 2,
  ErrUnknown          = 3,
  ErrMissingHostFeature = 4,
  ErrUnsupported      = 5,
  ErrExists           = 6,
  ErrFormat           = 7,
  ErrMemory           = 8,
  ErrBadHandle        = 9,
  ErrBadIndex         = 10,
  ErrValue            = 11,
  ReplyDefault        = 14,
  ReplyYes            = 15,
  ReplyNo             = 16,
}

// ─── Actions ────────────────────────────────────────────────────────────────

/** OFX action string constants per the OpenFX 1.5 specification. */
export const OFXAction = {
  Load:                  'OfxActionLoad',
  Unload:                'OfxActionUnload',
  Describe:              'OfxActionDescribe',
  DescribeInContext:      'OfxImageEffectActionDescribeInContext',
  CreateInstance:        'OfxActionCreateInstance',
  DestroyInstance:       'OfxActionDestroyInstance',
  BeginInstanceChanged:  'OfxActionBeginInstanceChanged',
  InstanceChanged:       'OfxActionInstanceChanged',
  EndInstanceChanged:    'OfxActionEndInstanceChanged',
  BeginInstanceEdit:     'OfxActionBeginInstanceEdit',
  EndInstanceEdit:       'OfxActionEndInstanceEdit',
  Render:                'OfxImageEffectActionRender',
  BeginSequenceRender:   'OfxImageEffectActionBeginSequenceRender',
  EndSequenceRender:     'OfxImageEffectActionEndSequenceRender',
  GetRegionOfDefinition: 'OfxImageEffectActionGetRegionOfDefinition',
  GetRegionsOfInterest:  'OfxImageEffectActionGetRegionsOfInterest',
  GetTimeDomain:         'OfxImageEffectActionGetTimeDomain',
  GetClipPreferences:    'OfxImageEffectActionGetClipPreferences',
  IsIdentity:            'OfxImageEffectActionIsIdentity',
  PurgeCaches:           'OfxActionPurgeCaches',
  SyncPrivateData:       'OfxActionSyncPrivateData',
  Dialog:                'OfxActionDialog',
} as const;

export type OFXActionType = (typeof OFXAction)[keyof typeof OFXAction];

// ─── Contexts ───────────────────────────────────────────────────────────────

/** OFX image effect context identifiers. */
export const OFXContext = {
  Filter:     'OfxImageEffectContextFilter',
  General:    'OfxImageEffectContextGeneral',
  Transition: 'OfxImageEffectContextTransition',
  Generator:  'OfxImageEffectContextGenerator',
  Retimer:    'OfxImageEffectContextRetimer',
  Paint:      'OfxImageEffectContextPaint',
} as const;

export type OFXContextType = (typeof OFXContext)[keyof typeof OFXContext];

// ─── Parameter Types ────────────────────────────────────────────────────────

/** OFX parameter type identifiers. */
export const OFXParamType = {
  Double:     'OfxParamTypeDouble',
  Double2D:   'OfxParamTypeDouble2D',
  Double3D:   'OfxParamTypeDouble3D',
  Integer:    'OfxParamTypeInteger',
  Integer2D:  'OfxParamTypeInteger2D',
  Integer3D:  'OfxParamTypeInteger3D',
  Boolean:    'OfxParamTypeBoolean',
  Choice:     'OfxParamTypeChoice',
  String:     'OfxParamTypeString',
  RGBA:       'OfxParamTypeRGBA',
  Custom:     'OfxParamTypeCustom',
  Parametric: 'OfxParamTypeParametric',
  PushButton: 'OfxParamTypePushButton',
  Group:      'OfxParamTypeGroup',
  Page:       'OfxParamTypePage',
} as const;

export type OFXParamTypeId = (typeof OFXParamType)[keyof typeof OFXParamType];

// ─── Pixel Depth & Component ────────────────────────────────────────────────

export const OFXBitDepth = {
  Byte:  'OfxBitDepthByte',
  Short: 'OfxBitDepthShort',
  Half:  'OfxBitDepthHalf',
  Float: 'OfxBitDepthFloat',
  None:  'OfxBitDepthNone',
} as const;

export type OFXBitDepthId = (typeof OFXBitDepth)[keyof typeof OFXBitDepth];

export const OFXImageComponent = {
  RGBA:  'OfxImageComponentRGBA',
  RGB:   'OfxImageComponentRGB',
  Alpha: 'OfxImageComponentAlpha',
  None:  'OfxImageComponentNone',
} as const;

export type OFXImageComponentId = (typeof OFXImageComponent)[keyof typeof OFXImageComponent];

// ─── Property Set ───────────────────────────────────────────────────────────

/** Typed key-value property storage matching the OFX property suite. */
export interface OFXPropertySet {
  strings: Record<string, string[]>;
  ints:    Record<string, number[]>;
  doubles: Record<string, number[]>;
  /** Pointer properties are represented as opaque IDs on the renderer side. */
  pointers: Record<string, (string | null)[]>;
}

/** Create an empty property set. */
export function createPropertySet(): OFXPropertySet {
  return { strings: {}, ints: {}, doubles: {}, pointers: {} };
}

// ─── Parameter Descriptor ───────────────────────────────────────────────────

export interface OFXParamDescriptor {
  name: string;
  type: OFXParamTypeId;
  label: string;
  hint: string;
  parent: string;
  enabled: boolean;
  secret: boolean;

  /** Default value(s). Length depends on type dimensionality. */
  defaultValue: number[] | string[] | boolean[];
  /** Minimum value(s) for numeric types. */
  min: number[];
  /** Maximum value(s) for numeric types. */
  max: number[];
  /** Display minimum for UI sliders. */
  displayMin: number[];
  /** Display maximum for UI sliders. */
  displayMax: number[];

  /** Choice option labels (for Choice params). */
  choiceOptions: string[];
  /** Choice option enum values (optional; defaults to index). */
  choiceEnums: string[];

  /** Script name used for serialisation. */
  scriptName: string;
  /** Whether the parameter can be animated (keyframed). */
  animates: boolean;
  /** Whether the parameter is persistant across instances. */
  persistant: boolean;
  /** Evaluate on change. */
  evaluateOnChange: boolean;

  /** Full OFX property set for extended queries. */
  properties: OFXPropertySet;
}

// ─── Clip Descriptor ────────────────────────────────────────────────────────

export interface OFXClipDescriptor {
  name: string;
  label: string;
  /** Whether this clip is optional. */
  optional: boolean;
  /** Supported pixel components. */
  supportedComponents: OFXImageComponentId[];
  /** Whether temporal clip access is needed. */
  temporalClipAccess: boolean;
  /** Whether the clip supports tiles. */
  supportsTiles: boolean;
  /** Whether the clip is a mask. */
  isMask: boolean;
  properties: OFXPropertySet;
}

// ─── Image Effect Descriptor ────────────────────────────────────────────────

export interface OFXImageEffectDescriptor {
  /** Unique identifier of the plugin effect. */
  pluginId: string;
  label: string;
  grouping: string;
  description: string;
  /** Supported contexts (filter, generator, transition, etc.). */
  supportedContexts: OFXContextType[];
  /** Supported pixel depths. */
  supportedPixelDepths: OFXBitDepthId[];
  /** Whether the effect supports tiles. */
  supportsTiles: boolean;
  /** Whether the effect is multi-resolution. */
  supportsMultiResolution: boolean;
  /** Whether the effect supports temporal clip access. */
  temporalClipAccess: boolean;
  /** Whether multiple clip depths are supported. */
  supportsMultipleClipDepths: boolean;
  /** Whether multiple clip PAR values are supported. */
  supportsMultipleClipPARs: boolean;
  /** Render thread safety: 'OfxImageEffectRenderUnsafe' | 'OfxImageEffectRenderInstanceSafe' | 'OfxImageEffectRenderFullySafe'. */
  renderThreadSafety: string;
  /** Host frame threading flag. */
  hostFrameThreading: boolean;
  /** Clip descriptors declared by the plugin. */
  clips: OFXClipDescriptor[];
  /** Parameter descriptors declared by the plugin. */
  params: OFXParamDescriptor[];
  /** Root property set of the effect descriptor. */
  properties: OFXPropertySet;
}

// ─── Render Arguments ───────────────────────────────────────────────────────

export interface OFXRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface OFXRenderScale {
  x: number;
  y: number;
}

/** Field rendering order. */
export const OFXField = {
  None:  'OfxImageFieldNone',
  Both:  'OfxImageFieldBoth',
  Lower: 'OfxImageFieldLower',
  Upper: 'OfxImageFieldUpper',
} as const;

export type OFXFieldId = (typeof OFXField)[keyof typeof OFXField];

export interface OFXRenderArgs {
  /** The render window (region to compute), in pixel coordinates. */
  renderWindow: OFXRect;
  /** Current time. */
  time: number;
  /** Field to render. */
  field: OFXFieldId;
  /** Render scale factor. */
  renderScale: OFXRenderScale;
  /** Whether this is a sequential render. */
  sequentialRender: boolean;
  /** Whether this is an interactive render (user preview). */
  interactiveRender: boolean;
}

// ─── Plugin Descriptor ──────────────────────────────────────────────────────

/** Represents a loaded OFX plugin binary's metadata. */
export interface OFXPlugin {
  /** The unique plugin identifier string (e.g. "com.vendor.myeffect"). */
  id: string;
  /** Plugin's major.minor version. */
  versionMajor: number;
  versionMinor: number;
  /** OFX API version the plugin was built against. */
  apiVersionMajor: number;
  apiVersionMinor: number;
  /** The file path of the .ofx bundle on disk. */
  bundlePath: string;
  /** The effect descriptor populated after calling Describe. */
  effectDescriptor: OFXImageEffectDescriptor | null;
}

// ─── Suite Descriptor ───────────────────────────────────────────────────────

/**
 * Named function-pointer table. In native code this would be a C struct of
 * function pointers. On the renderer side we store an identifier and the
 * version so the IPC bridge can route calls to the correct main-process
 * implementation.
 */
export interface OFXSuiteDescriptor {
  name: string;
  version: number;
}

/** Standard suite identifiers. */
export const OFXSuiteNames = {
  Property:     'OfxPropertySuite',
  ImageEffect:  'OfxImageEffectSuite',
  Parameter:    'OfxParameterSuite',
  Memory:       'OfxMemorySuite',
  MultiThread:  'OfxMultiThreadSuite',
  Message:      'OfxMessageSuite',
  Progress:     'OfxProgressSuite',
  TimeLine:     'OfxTimeLineSuite',
  Parametric:   'OfxParametricParameterSuite',
} as const;

// ─── OFX Image ──────────────────────────────────────────────────────────────

/** An OFX image buffer as exchanged over IPC. */
export interface OFXImage {
  /** Pixel data. Byte images use Uint8Array; float images use Float32Array. */
  data: ArrayBuffer;
  /** Row stride in bytes. */
  rowBytes: number;
  /** Bounds of the image in pixel coordinates. */
  bounds: OFXRect;
  /** Pixel aspect ratio (PAR). */
  pixelAspectRatio: number;
  /** Pixel component layout. */
  components: OFXImageComponentId;
  /** Bit depth. */
  bitDepth: OFXBitDepthId;
  /** Unique identity of the underlying data (for caching). */
  uniqueId: string;
}


// =============================================================================
//  2. Plugin Discovery & Loading
// =============================================================================

/**
 * Standard OFX plugin search paths per platform.
 * On macOS: /Library/OFX/Plugins, ~/Library/OFX/Plugins
 * On Windows: C:\Program Files\Common Files\OFX\Plugins
 * On Linux: /usr/OFX/Plugins
 */
export function getDefaultPluginPaths(): string[] {
  if (typeof navigator === 'undefined') return [];

  const ua = navigator.userAgent;
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return [
      '/Library/OFX/Plugins',
      `${getHomePath()}/Library/OFX/Plugins`,
    ];
  }
  if (/Windows/i.test(ua)) {
    return [
      'C:\\Program Files\\Common Files\\OFX\\Plugins',
      'C:\\Program Files (x86)\\Common Files\\OFX\\Plugins',
    ];
  }
  // Linux
  return [
    '/usr/OFX/Plugins',
    `${getHomePath()}/.OFX/Plugins`,
  ];
}

/** Resolve user home directory via Electron bridge or fallback. */
function getHomePath(): string {
  // In Electron we can query the main process; fallback to env stub.
  return (typeof process !== 'undefined' && process.env?.HOME) || '~';
}

/**
 * Information about a discovered .ofx bundle on disk.
 */
export interface OFXBundleInfo {
  /** Absolute path to the .ofx bundle directory. */
  path: string;
  /** Bundle name derived from directory name. */
  name: string;
  /** Platform-specific binary path within the bundle. */
  binaryPath: string;
  /** The Info.plist or manifest metadata, if found. */
  plistData: Record<string, unknown> | null;
}

/**
 * Scan standard OFX plugin directories for .ofx bundles.
 *
 * @desktopOnly Requires filesystem access via Electron main process.
 * @param paths - Directories to scan. Defaults to platform standard paths.
 * @returns Array of discovered bundle descriptors.
 */
export async function scanPluginDirectories(
  paths?: string[],
): Promise<OFXBundleInfo[]> {
  const ipc = getIPCBridge();
  if (!ipc) {
    console.warn('[OpenFXBridge] scanPluginDirectories requires Electron');
    return [];
  }

  const searchPaths = paths ?? getDefaultPluginPaths();
  return ipc.invoke<OFXBundleInfo[]>('ofx:scan-plugins', { paths: searchPaths });
}

/**
 * Load an OFX plugin from a bundle path. This calls the native loader in
 * the Electron main process which will dlopen/LoadLibrary the binary,
 * call the plugin's OfxGetNumberOfPlugins and OfxGetPlugin entry points,
 * then dispatch the Load action.
 *
 * @desktopOnly Requires native module loading via Electron.
 * @param bundlePath - Absolute path to the .ofx bundle.
 * @returns The loaded plugin descriptor.
 */
export async function loadPlugin(bundlePath: string): Promise<OFXPlugin> {
  const ipc = getIPCBridge();
  if (!ipc) {
    throw new Error('[OpenFXBridge] loadPlugin requires Electron');
  }

  return ipc.invoke<OFXPlugin>('ofx:load-plugin', { bundlePath });
}

/**
 * Call the Describe and DescribeInContext actions on a loaded plugin to
 * populate its effect descriptor with clips, parameters, and capabilities.
 *
 * @desktopOnly Requires native OFX host in Electron main process.
 * @param pluginId - The unique identifier of the loaded plugin.
 * @returns The fully populated effect descriptor.
 */
export async function describePlugin(
  pluginId: string,
): Promise<OFXImageEffectDescriptor> {
  const ipc = getIPCBridge();
  if (!ipc) {
    throw new Error('[OpenFXBridge] describePlugin requires Electron');
  }

  return ipc.invoke<OFXImageEffectDescriptor>('ofx:describe-plugin', { pluginId });
}

/**
 * Unload a plugin, calling the Unload action and releasing the native binary.
 *
 * @desktopOnly Requires native OFX host in Electron main process.
 * @param pluginId - The unique identifier of the plugin to unload.
 */
export async function unloadPlugin(pluginId: string): Promise<void> {
  const ipc = getIPCBridge();
  if (!ipc) {
    console.warn('[OpenFXBridge] unloadPlugin requires Electron');
    return;
  }

  await ipc.invoke<void>('ofx:unload-plugin', { pluginId });
}


// =============================================================================
//  3. Plugin-to-App Bridge
// =============================================================================

/**
 * Convert an OFX parameter descriptor to the app's EffectParamDef.
 */
function convertOFXParamToAppParam(ofxParam: OFXParamDescriptor): EffectParamDef | null {
  const base = {
    name: ofxParam.scriptName || ofxParam.name,
  };

  switch (ofxParam.type) {
    case OFXParamType.Double:
      return {
        ...base,
        type: 'number',
        default: (ofxParam.defaultValue[0] as number) ?? 0,
        min: ofxParam.displayMin[0] ?? ofxParam.min[0],
        max: ofxParam.displayMax[0] ?? ofxParam.max[0],
        step: computeStep(ofxParam.displayMin[0], ofxParam.displayMax[0]),
      };

    case OFXParamType.Double2D:
    case OFXParamType.Double3D: {
      // Expand multi-dimensional doubles into separate numbered params.
      // Return null here; handled by convertOFXParamsToAppParams.
      return null;
    }

    case OFXParamType.Integer:
      return {
        ...base,
        type: 'number',
        default: (ofxParam.defaultValue[0] as number) ?? 0,
        min: ofxParam.min[0],
        max: ofxParam.max[0],
        step: 1,
      };

    case OFXParamType.Boolean:
      return {
        ...base,
        type: 'boolean',
        default: Boolean(ofxParam.defaultValue[0]),
      };

    case OFXParamType.Choice:
      return {
        ...base,
        type: 'select',
        default: ofxParam.choiceOptions[(ofxParam.defaultValue[0] as number) ?? 0] ?? ofxParam.choiceOptions[0] ?? '',
        options: ofxParam.choiceOptions.length > 0 ? ofxParam.choiceOptions : undefined,
      };

    case OFXParamType.RGBA:
      return {
        ...base,
        type: 'color',
        default: rgbaToHex(
          (ofxParam.defaultValue[0] as number) ?? 1,
          (ofxParam.defaultValue[1] as number) ?? 1,
          (ofxParam.defaultValue[2] as number) ?? 1,
          (ofxParam.defaultValue[3] as number) ?? 1,
        ),
      };

    case OFXParamType.String:
      // String params don't map cleanly; skip unless a select mapping exists.
      return null;

    case OFXParamType.PushButton:
    case OFXParamType.Group:
    case OFXParamType.Page:
    case OFXParamType.Parametric:
    case OFXParamType.Custom:
      // Structural / non-value params are not exposed in the simple UI.
      return null;

    default:
      return null;
  }
}

/**
 * Expand multi-dimensional OFX params (Double2D, Double3D, Integer2D, Integer3D)
 * into individual app params and collect all converted params.
 */
function convertOFXParamsToAppParams(ofxParams: OFXParamDescriptor[]): EffectParamDef[] {
  const result: EffectParamDef[] = [];

  for (const p of ofxParams) {
    // Skip structural params entirely.
    if (p.type === OFXParamType.Group || p.type === OFXParamType.Page) continue;
    // Skip secret (hidden) params.
    if (p.secret) continue;

    // Handle multi-dimensional types by expanding.
    if (p.type === OFXParamType.Double2D || p.type === OFXParamType.Integer2D) {
      const suffixes = ['X', 'Y'];
      const isInt = p.type === OFXParamType.Integer2D;
      for (let i = 0; i < 2; i++) {
        result.push({
          name: `${p.scriptName || p.name}_${suffixes[i]}`,
          type: 'number',
          default: (p.defaultValue[i] as number) ?? 0,
          min: p.displayMin[i] ?? p.min[i],
          max: p.displayMax[i] ?? p.max[i],
          step: isInt ? 1 : computeStep(p.displayMin[i], p.displayMax[i]),
        });
      }
      continue;
    }

    if (p.type === OFXParamType.Double3D || p.type === OFXParamType.Integer3D) {
      const suffixes = ['X', 'Y', 'Z'];
      const isInt = p.type === OFXParamType.Integer3D;
      for (let i = 0; i < 3; i++) {
        result.push({
          name: `${p.scriptName || p.name}_${suffixes[i]}`,
          type: 'number',
          default: (p.defaultValue[i] as number) ?? 0,
          min: p.displayMin[i] ?? p.min[i],
          max: p.displayMax[i] ?? p.max[i],
          step: isInt ? 1 : computeStep(p.displayMin[i], p.displayMax[i]),
        });
      }
      continue;
    }

    const converted = convertOFXParamToAppParam(p);
    if (converted) {
      result.push(converted);
    }
  }

  return result;
}

/**
 * Register a described OFX plugin as an EffectDefinition in the app's
 * effects engine so it appears alongside built-in effects.
 *
 * @param ofxPlugin - A plugin with a populated effectDescriptor.
 * @returns The registered EffectDefinition, or null if the plugin has no descriptor.
 */
export function registerOFXPlugin(ofxPlugin: OFXPlugin): EffectDefinition | null {
  if (!ofxPlugin.effectDescriptor) {
    console.warn(`[OpenFXBridge] Plugin "${ofxPlugin.id}" has no effect descriptor`);
    return null;
  }

  const desc = ofxPlugin.effectDescriptor;
  const params = convertOFXParamsToAppParams(desc.params);

  const definition: EffectDefinition = {
    id: `ofx:${ofxPlugin.id}`,
    name: desc.label || ofxPlugin.id,
    category: mapGroupingToCategory(desc.grouping),
    params,
    intrinsic: false,
  };

  effectsEngine.registerDefinition(definition);
  return definition;
}

/**
 * Create an OFX effect instance and map it to the app's EffectInstance.
 * This calls the CreateInstance action on the native side.
 *
 * @desktopOnly Requires native OFX host in Electron main process.
 * @param pluginId - The OFX plugin identifier.
 * @param clipId   - The timeline clip to attach the effect to.
 * @returns The mapped EffectInstance.
 */
export async function createOFXInstance(
  pluginId: string,
  clipId: string,
): Promise<EffectInstance | null> {
  const ipc = getIPCBridge();
  if (!ipc) {
    throw new Error('[OpenFXBridge] createOFXInstance requires Electron');
  }

  const defId = `ofx:${pluginId}`;
  const appInstance = effectsEngine.createInstance(defId);
  if (!appInstance) return null;

  // Tell the native host to create a corresponding OFX instance.
  const nativeHandle = await ipc.invoke<string>('ofx:create-instance', {
    pluginId,
    instanceId: appInstance.id,
  });

  // Store the native handle in the OFX instance registry.
  ofxInstanceRegistry.set(appInstance.id, {
    pluginId,
    nativeHandle,
    appInstance,
  });

  effectsEngine.addEffectToClip(clipId, appInstance.id);
  return appInstance;
}

/**
 * Set a parameter value on an OFX instance, forwarding to both the app's
 * effect engine and the native OFX host.
 *
 * @desktopOnly Requires native OFX host in Electron main process.
 * @param instanceId - The app-side effect instance ID.
 * @param paramName  - The parameter name.
 * @param value      - The new value.
 */
export async function setOFXParam(
  instanceId: string,
  paramName: string,
  value: unknown,
): Promise<void> {
  // Update the app-side param immediately for responsiveness.
  effectsEngine.updateParam(instanceId, paramName, value as string | number | boolean);

  const entry = ofxInstanceRegistry.get(instanceId);
  if (!entry) return;

  const ipc = getIPCBridge();
  if (!ipc) return;

  await ipc.invoke<void>('ofx:set-param', {
    nativeHandle: entry.nativeHandle,
    paramName,
    value: serializeParamValue(value),
  });
}

/**
 * Execute the Render action on an OFX effect instance.
 *
 * @desktopOnly Requires native OFX host in Electron main process.
 * @param instanceId   - The app-side effect instance ID.
 * @param inputImage   - The input image data.
 * @param outputImage  - Pre-allocated output buffer (same dimensions as input).
 * @param time         - The render time in seconds.
 * @param renderWindow - The pixel region to render.
 * @returns The output OFX image, or null on failure.
 */
export async function renderOFX(
  instanceId: string,
  inputImage: OFXImage,
  outputImage: OFXImage,
  time: number,
  renderWindow: OFXRect,
): Promise<OFXImage | null> {
  const entry = ofxInstanceRegistry.get(instanceId);
  if (!entry) {
    console.warn(`[OpenFXBridge] No OFX instance registered for "${instanceId}"`);
    return null;
  }

  const ipc = getIPCBridge();
  if (!ipc) {
    throw new Error('[OpenFXBridge] renderOFX requires Electron');
  }

  const args: OFXRenderArgs = {
    renderWindow,
    time,
    field: OFXField.None,
    renderScale: { x: 1.0, y: 1.0 },
    sequentialRender: false,
    interactiveRender: true,
  };

  return ipc.invoke<OFXImage>('ofx:render', {
    nativeHandle: entry.nativeHandle,
    inputImage: prepareImageForTransfer(inputImage),
    outputImage: prepareImageForTransfer(outputImage),
    renderArgs: args,
  });
}


// =============================================================================
//  4. Suite Implementations (Host-Side)
// =============================================================================
//
//  These classes implement the host-side logic for each OFX suite. In a full
//  native host these would be C function pointer tables; here they provide
//  the renderer-side bookkeeping and defer to IPC for native operations.
// =============================================================================

// ─── Property Suite ─────────────────────────────────────────────────────────

/** Host-side implementation of the OFX Property Suite v1. */
export class OFXPropertySuiteImpl {
  private sets: Map<string, OFXPropertySet> = new Map();

  /** Register a property set by handle ID. */
  register(handle: string, propSet: OFXPropertySet): void {
    this.sets.set(handle, propSet);
  }

  /** Remove a property set. */
  unregister(handle: string): void {
    this.sets.delete(handle);
  }

  // -- String properties --

  propSetString(handle: string, property: string, index: number, value: string): OFXStatus {
    const ps = this.sets.get(handle);
    if (!ps) return OFXStatus.ErrBadHandle;
    if (!ps.strings[property]) ps.strings[property] = [];
    ps.strings[property][index] = value;
    return OFXStatus.OK;
  }

  propGetString(handle: string, property: string, index: number): { status: OFXStatus; value: string } {
    const ps = this.sets.get(handle);
    if (!ps) return { status: OFXStatus.ErrBadHandle, value: '' };
    const arr = ps.strings[property];
    if (!arr || index >= arr.length) return { status: OFXStatus.ErrBadIndex, value: '' };
    return { status: OFXStatus.OK, value: arr[index] };
  }

  // -- Int properties --

  propSetInt(handle: string, property: string, index: number, value: number): OFXStatus {
    const ps = this.sets.get(handle);
    if (!ps) return OFXStatus.ErrBadHandle;
    if (!ps.ints[property]) ps.ints[property] = [];
    ps.ints[property][index] = value;
    return OFXStatus.OK;
  }

  propGetInt(handle: string, property: string, index: number): { status: OFXStatus; value: number } {
    const ps = this.sets.get(handle);
    if (!ps) return { status: OFXStatus.ErrBadHandle, value: 0 };
    const arr = ps.ints[property];
    if (!arr || index >= arr.length) return { status: OFXStatus.ErrBadIndex, value: 0 };
    return { status: OFXStatus.OK, value: arr[index] };
  }

  // -- Double properties --

  propSetDouble(handle: string, property: string, index: number, value: number): OFXStatus {
    const ps = this.sets.get(handle);
    if (!ps) return OFXStatus.ErrBadHandle;
    if (!ps.doubles[property]) ps.doubles[property] = [];
    ps.doubles[property][index] = value;
    return OFXStatus.OK;
  }

  propGetDouble(handle: string, property: string, index: number): { status: OFXStatus; value: number } {
    const ps = this.sets.get(handle);
    if (!ps) return { status: OFXStatus.ErrBadHandle, value: 0 };
    const arr = ps.doubles[property];
    if (!arr || index >= arr.length) return { status: OFXStatus.ErrBadIndex, value: 0 };
    return { status: OFXStatus.OK, value: arr[index] };
  }

  // -- Pointer properties --

  propSetPointer(handle: string, property: string, index: number, value: string | null): OFXStatus {
    const ps = this.sets.get(handle);
    if (!ps) return OFXStatus.ErrBadHandle;
    if (!ps.pointers[property]) ps.pointers[property] = [];
    ps.pointers[property][index] = value;
    return OFXStatus.OK;
  }

  propGetPointer(handle: string, property: string, index: number): { status: OFXStatus; value: string | null } {
    const ps = this.sets.get(handle);
    if (!ps) return { status: OFXStatus.ErrBadHandle, value: null };
    const arr = ps.pointers[property];
    if (!arr || index >= arr.length) return { status: OFXStatus.ErrBadIndex, value: null };
    return { status: OFXStatus.OK, value: arr[index] };
  }

  // -- Dimension query --

  propGetDimension(handle: string, property: string): { status: OFXStatus; dimension: number } {
    const ps = this.sets.get(handle);
    if (!ps) return { status: OFXStatus.ErrBadHandle, dimension: 0 };
    const dim =
      ps.strings[property]?.length ??
      ps.ints[property]?.length ??
      ps.doubles[property]?.length ??
      ps.pointers[property]?.length ??
      0;
    return { status: OFXStatus.OK, dimension: dim };
  }

  propReset(handle: string, property: string): OFXStatus {
    const ps = this.sets.get(handle);
    if (!ps) return OFXStatus.ErrBadHandle;
    delete ps.strings[property];
    delete ps.ints[property];
    delete ps.doubles[property];
    delete ps.pointers[property];
    return OFXStatus.OK;
  }
}

// ─── Image Effect Suite ─────────────────────────────────────────────────────

/** Host-side implementation of the OFX Image Effect Suite v1. */
export class OFXImageEffectSuiteImpl {
  private clipImages: Map<string, OFXImage> = new Map();

  /** Associate an image with a clip for the current render pass. */
  setClipImage(clipHandle: string, image: OFXImage): void {
    this.clipImages.set(clipHandle, image);
  }

  /** Retrieve the image for a clip handle. */
  getClipImage(clipHandle: string): OFXImage | null {
    return this.clipImages.get(clipHandle) ?? null;
  }

  /** Release clip image after render. */
  releaseClipImage(clipHandle: string): void {
    this.clipImages.delete(clipHandle);
  }

  /** Clear all clip images (end of render pass). */
  clearAll(): void {
    this.clipImages.clear();
  }

  /** Get the clip descriptor property set handle for a named clip. */
  clipGetHandle(
    _effectHandle: string,
    clipName: string,
  ): { status: OFXStatus; clipHandle: string } {
    // Clip handles are derived from the instance + clip name.
    const clipHandle = `${_effectHandle}:clip:${clipName}`;
    return { status: OFXStatus.OK, clipHandle };
  }

  /** Get image from clip at a given time. */
  clipGetImage(
    clipHandle: string,
    _time: number,
    _region: OFXRect | null,
  ): { status: OFXStatus; image: OFXImage | null } {
    const image = this.clipImages.get(clipHandle) ?? null;
    if (!image) return { status: OFXStatus.Failed, image: null };
    return { status: OFXStatus.OK, image };
  }

  /** Release a fetched image. */
  clipReleaseImage(image: OFXImage): OFXStatus {
    // In a real host, this would decrement refcounts on GPU/CPU buffers.
    void image;
    return OFXStatus.OK;
  }
}

// ─── Parameter Suite ────────────────────────────────────────────────────────

/** Host-side implementation of the OFX Parameter Suite v1. */
export class OFXParameterSuiteImpl {
  /**
   * Storage of current parameter values indexed by instanceId -> paramName.
   * Values are stored as number arrays (even scalars are [value]).
   */
  private paramValues: Map<string, Map<string, number[]>> = new Map();
  private paramKeyframes: Map<string, Map<string, { time: number; value: number[] }[]>> = new Map();

  registerInstance(instanceId: string): void {
    this.paramValues.set(instanceId, new Map());
    this.paramKeyframes.set(instanceId, new Map());
  }

  unregisterInstance(instanceId: string): void {
    this.paramValues.delete(instanceId);
    this.paramKeyframes.delete(instanceId);
  }

  /** Set the current value of a parameter. */
  paramSetValue(instanceId: string, paramName: string, value: number[]): OFXStatus {
    const instMap = this.paramValues.get(instanceId);
    if (!instMap) return OFXStatus.ErrBadHandle;
    instMap.set(paramName, value);
    return OFXStatus.OK;
  }

  /** Get the current value of a parameter. */
  paramGetValue(instanceId: string, paramName: string): { status: OFXStatus; value: number[] } {
    const instMap = this.paramValues.get(instanceId);
    if (!instMap) return { status: OFXStatus.ErrBadHandle, value: [] };
    const val = instMap.get(paramName);
    if (!val) return { status: OFXStatus.ErrBadIndex, value: [] };
    return { status: OFXStatus.OK, value: val };
  }

  /** Get the value of a parameter at a specific time (interpolated). */
  paramGetValueAtTime(
    instanceId: string,
    paramName: string,
    time: number,
  ): { status: OFXStatus; value: number[] } {
    const kfMap = this.paramKeyframes.get(instanceId);
    if (!kfMap) return { status: OFXStatus.ErrBadHandle, value: [] };

    const keyframes = kfMap.get(paramName);
    if (!keyframes || keyframes.length === 0) {
      // Fall back to static value.
      return this.paramGetValue(instanceId, paramName);
    }

    // Sort by time.
    const sorted = [...keyframes].sort((a, b) => a.time - b.time);

    // Before first keyframe.
    if (time <= sorted[0].time) {
      return { status: OFXStatus.OK, value: sorted[0].value };
    }
    // After last keyframe.
    if (time >= sorted[sorted.length - 1].time) {
      return { status: OFXStatus.OK, value: sorted[sorted.length - 1].value };
    }

    // Find surrounding keyframes and lerp.
    for (let i = 0; i < sorted.length - 1; i++) {
      if (time >= sorted[i].time && time <= sorted[i + 1].time) {
        const t = (time - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
        const interpolated = sorted[i].value.map(
          (v, idx) => v + (sorted[i + 1].value[idx] - v) * t,
        );
        return { status: OFXStatus.OK, value: interpolated };
      }
    }

    return this.paramGetValue(instanceId, paramName);
  }

  /** Set a keyframe. */
  paramSetKeyframe(
    instanceId: string,
    paramName: string,
    time: number,
    value: number[],
  ): OFXStatus {
    const kfMap = this.paramKeyframes.get(instanceId);
    if (!kfMap) return OFXStatus.ErrBadHandle;

    let keyframes = kfMap.get(paramName);
    if (!keyframes) {
      keyframes = [];
      kfMap.set(paramName, keyframes);
    }

    // Replace existing keyframe at this time or insert.
    const existing = keyframes.findIndex((kf) => Math.abs(kf.time - time) < 1e-9);
    if (existing >= 0) {
      keyframes[existing].value = value;
    } else {
      keyframes.push({ time, value });
    }

    return OFXStatus.OK;
  }

  /** Delete a keyframe at a specific time. */
  paramDeleteKeyframe(instanceId: string, paramName: string, time: number): OFXStatus {
    const kfMap = this.paramKeyframes.get(instanceId);
    if (!kfMap) return OFXStatus.ErrBadHandle;

    const keyframes = kfMap.get(paramName);
    if (!keyframes) return OFXStatus.ErrBadIndex;

    const idx = keyframes.findIndex((kf) => Math.abs(kf.time - time) < 1e-9);
    if (idx < 0) return OFXStatus.ErrBadIndex;

    keyframes.splice(idx, 1);
    return OFXStatus.OK;
  }

  /** Delete all keyframes for a parameter. */
  paramDeleteAllKeyframes(instanceId: string, paramName: string): OFXStatus {
    const kfMap = this.paramKeyframes.get(instanceId);
    if (!kfMap) return OFXStatus.ErrBadHandle;
    kfMap.delete(paramName);
    return OFXStatus.OK;
  }

  /** Get the number of keyframes for a parameter. */
  paramGetNumKeyframes(instanceId: string, paramName: string): { status: OFXStatus; count: number } {
    const kfMap = this.paramKeyframes.get(instanceId);
    if (!kfMap) return { status: OFXStatus.ErrBadHandle, count: 0 };
    const keyframes = kfMap.get(paramName);
    return { status: OFXStatus.OK, count: keyframes?.length ?? 0 };
  }

  /** Get the time of the Nth keyframe. */
  paramGetKeyframeTime(
    instanceId: string,
    paramName: string,
    nthKey: number,
  ): { status: OFXStatus; time: number } {
    const kfMap = this.paramKeyframes.get(instanceId);
    if (!kfMap) return { status: OFXStatus.ErrBadHandle, time: 0 };
    const keyframes = kfMap.get(paramName);
    if (!keyframes || nthKey >= keyframes.length) {
      return { status: OFXStatus.ErrBadIndex, time: 0 };
    }
    const sorted = [...keyframes].sort((a, b) => a.time - b.time);
    return { status: OFXStatus.OK, time: sorted[nthKey].time };
  }
}

// ─── Memory Suite ───────────────────────────────────────────────────────────

/** Host-side implementation of the OFX Memory Suite v1. */
export class OFXMemorySuiteImpl {
  private allocations: Map<string, ArrayBuffer> = new Map();
  private nextAllocId = 0;
  private totalAllocated = 0;

  /** Maximum allocation budget (512 MB). */
  readonly maxBudget = 512 * 1024 * 1024;

  /**
   * Allocate a block of memory.
   * @returns The handle and status.
   */
  memoryAlloc(nBytes: number): { status: OFXStatus; handle: string | null } {
    if (nBytes <= 0) return { status: OFXStatus.ErrValue, handle: null };
    if (this.totalAllocated + nBytes > this.maxBudget) {
      return { status: OFXStatus.ErrMemory, handle: null };
    }

    try {
      const buffer = new ArrayBuffer(nBytes);
      const handle = `ofx_mem_${this.nextAllocId++}`;
      this.allocations.set(handle, buffer);
      this.totalAllocated += nBytes;
      return { status: OFXStatus.OK, handle };
    } catch {
      return { status: OFXStatus.ErrMemory, handle: null };
    }
  }

  /** Free a previously allocated block. */
  memoryFree(handle: string): OFXStatus {
    const buffer = this.allocations.get(handle);
    if (!buffer) return OFXStatus.ErrBadHandle;
    this.totalAllocated -= buffer.byteLength;
    this.allocations.delete(handle);
    return OFXStatus.OK;
  }

  /** Get the ArrayBuffer for a handle. */
  getBuffer(handle: string): ArrayBuffer | null {
    return this.allocations.get(handle) ?? null;
  }

  /** Get current allocation stats. */
  getStats(): { count: number; totalBytes: number } {
    return { count: this.allocations.size, totalBytes: this.totalAllocated };
  }

  /** Release all allocations. */
  purge(): void {
    this.allocations.clear();
    this.totalAllocated = 0;
  }
}

// ─── Multi-Thread Suite ─────────────────────────────────────────────────────

/** Host-side stub for the OFX Multi-Thread Suite v1. */
export class OFXMultiThreadSuiteImpl {
  /** Return the number of available threads. */
  getNumCPUs(): number {
    return navigator?.hardwareConcurrency ?? 4;
  }

  /** Return the current thread index (always 0 in single-threaded renderer). */
  getThreadIndex(): number {
    return 0;
  }

  /** Whether the caller is the main thread spawned by multiThread. */
  isSpawnedThread(): boolean {
    return false;
  }

  /**
   * Request the host to spawn threads for parallel processing.
   * On the renderer side this is a no-op; actual threading is handled by
   * the Electron main process native host.
   */
  multiThread(
    _func: string,
    _nThreads: number,
  ): OFXStatus {
    // Deferred to native host via IPC.
    return OFXStatus.OK;
  }

  /**
   * Mutex operations are not applicable on the renderer side. Native host
   * provides real mutexes via pthreads / WinAPI critical sections.
   */
  mutexCreate(_name: string): { status: OFXStatus; handle: string } {
    const handle = `ofx_mutex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { status: OFXStatus.OK, handle };
  }

  mutexDestroy(_handle: string): OFXStatus {
    return OFXStatus.OK;
  }

  mutexLock(_handle: string): OFXStatus {
    return OFXStatus.OK;
  }

  mutexUnlock(_handle: string): OFXStatus {
    return OFXStatus.OK;
  }

  mutexTryLock(_handle: string): OFXStatus {
    return OFXStatus.OK;
  }
}

// ─── Message Suite ──────────────────────────────────────────────────────────

/** Log levels for OFX messages. */
export const OFXMessageType = {
  Fatal:   'OfxMessageFatal',
  Error:   'OfxMessageError',
  Warning: 'OfxMessageWarning',
  Message: 'OfxMessageMessage',
  Log:     'OfxMessageLog',
  Question: 'OfxMessageQuestion',
} as const;

export type OFXMessageTypeId = (typeof OFXMessageType)[keyof typeof OFXMessageType];

/** Host-side implementation of the OFX Message Suite v2. */
export class OFXMessageSuiteImpl {
  private messageLog: { timestamp: number; type: OFXMessageTypeId; pluginId: string; message: string }[] = [];
  private listeners: Set<(entry: typeof this.messageLog[0]) => void> = new Set();

  /**
   * Post a message from a plugin.
   */
  message(
    pluginId: string,
    type: OFXMessageTypeId,
    messageId: string | null,
    format: string,
  ): OFXStatus {
    const entry = {
      timestamp: Date.now(),
      type,
      pluginId,
      message: messageId ? `[${messageId}] ${format}` : format,
    };

    this.messageLog.push(entry);

    // Also log to console with appropriate level.
    switch (type) {
      case OFXMessageType.Fatal:
      case OFXMessageType.Error:
        console.error(`[OFX:${pluginId}]`, format);
        break;
      case OFXMessageType.Warning:
        console.warn(`[OFX:${pluginId}]`, format);
        break;
      default:
        console.log(`[OFX:${pluginId}]`, format);
        break;
    }

    // Notify listeners.
    for (const listener of this.listeners) {
      try { listener(entry); } catch (err) {
        console.error('[OFXMessageSuite] Listener error:', err);
      }
    }

    return OFXStatus.OK;
  }

  /** Set persistent message (displayed in UI). */
  setPersistentMessage(
    pluginId: string,
    type: OFXMessageTypeId,
    _messageId: string | null,
    format: string,
  ): OFXStatus {
    return this.message(pluginId, type, 'persistent', format);
  }

  /** Clear persistent message. */
  clearPersistentMessage(_pluginId: string): OFXStatus {
    return OFXStatus.OK;
  }

  /** Get the message log. */
  getLog(): typeof this.messageLog {
    return [...this.messageLog];
  }

  /** Clear the message log. */
  clearLog(): void {
    this.messageLog = [];
  }

  /** Subscribe to new messages. */
  subscribe(cb: (entry: { timestamp: number; type: OFXMessageTypeId; pluginId: string; message: string }) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }
}


// =============================================================================
//  5. Image Handling & Conversion
// =============================================================================

/**
 * Create an OFXImage from an ImageData object (Canvas 2D).
 * ImageData is always RGBA bytes (0-255).
 */
export function imageDataToOFXImage(imageData: ImageData, uniqueId?: string): OFXImage {
  return {
    data: imageData.data.buffer.slice(0),
    rowBytes: imageData.width * 4,
    bounds: { x1: 0, y1: 0, x2: imageData.width, y2: imageData.height },
    pixelAspectRatio: 1.0,
    components: OFXImageComponent.RGBA,
    bitDepth: OFXBitDepth.Byte,
    uniqueId: uniqueId ?? `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

/**
 * Convert an OFXImage back to an ImageData for Canvas 2D display.
 * Handles byte, float, and single-channel source formats.
 */
export function ofxImageToImageData(ofxImage: OFXImage): ImageData {
  const width  = ofxImage.bounds.x2 - ofxImage.bounds.x1;
  const height = ofxImage.bounds.y2 - ofxImage.bounds.y1;
  const imageData = new ImageData(width, height);
  const dst = imageData.data;

  if (ofxImage.bitDepth === OFXBitDepth.Byte) {
    const src = new Uint8Array(ofxImage.data);
    if (ofxImage.components === OFXImageComponent.RGBA) {
      // Direct copy with row-stride handling.
      for (let y = 0; y < height; y++) {
        const srcOffset = y * ofxImage.rowBytes;
        const dstOffset = y * width * 4;
        for (let x = 0; x < width * 4; x++) {
          dst[dstOffset + x] = src[srcOffset + x];
        }
      }
    } else if (ofxImage.components === OFXImageComponent.RGB) {
      for (let y = 0; y < height; y++) {
        const srcRowStart = y * ofxImage.rowBytes;
        const dstRowStart = y * width * 4;
        for (let x = 0; x < width; x++) {
          dst[dstRowStart + x * 4]     = src[srcRowStart + x * 3];
          dst[dstRowStart + x * 4 + 1] = src[srcRowStart + x * 3 + 1];
          dst[dstRowStart + x * 4 + 2] = src[srcRowStart + x * 3 + 2];
          dst[dstRowStart + x * 4 + 3] = 255;
        }
      }
    } else if (ofxImage.components === OFXImageComponent.Alpha) {
      for (let y = 0; y < height; y++) {
        const srcRowStart = y * ofxImage.rowBytes;
        const dstRowStart = y * width * 4;
        for (let x = 0; x < width; x++) {
          const a = src[srcRowStart + x];
          dst[dstRowStart + x * 4]     = a;
          dst[dstRowStart + x * 4 + 1] = a;
          dst[dstRowStart + x * 4 + 2] = a;
          dst[dstRowStart + x * 4 + 3] = 255;
        }
      }
    }
  } else if (ofxImage.bitDepth === OFXBitDepth.Float) {
    const src = new Float32Array(ofxImage.data);
    if (ofxImage.components === OFXImageComponent.RGBA) {
      const srcPixelStride = ofxImage.rowBytes / 4; // float32 = 4 bytes each
      for (let y = 0; y < height; y++) {
        const srcRowStart = y * srcPixelStride;
        const dstRowStart = y * width * 4;
        for (let x = 0; x < width; x++) {
          dst[dstRowStart + x * 4]     = clampByte(src[srcRowStart + x * 4] * 255);
          dst[dstRowStart + x * 4 + 1] = clampByte(src[srcRowStart + x * 4 + 1] * 255);
          dst[dstRowStart + x * 4 + 2] = clampByte(src[srcRowStart + x * 4 + 2] * 255);
          dst[dstRowStart + x * 4 + 3] = clampByte(src[srcRowStart + x * 4 + 3] * 255);
        }
      }
    } else if (ofxImage.components === OFXImageComponent.Alpha) {
      const srcPixelStride = ofxImage.rowBytes / 4;
      for (let y = 0; y < height; y++) {
        const srcRowStart = y * srcPixelStride;
        const dstRowStart = y * width * 4;
        for (let x = 0; x < width; x++) {
          const a = clampByte(src[srcRowStart + x] * 255);
          dst[dstRowStart + x * 4]     = a;
          dst[dstRowStart + x * 4 + 1] = a;
          dst[dstRowStart + x * 4 + 2] = a;
          dst[dstRowStart + x * 4 + 3] = 255;
        }
      }
    }
  }

  return imageData;
}

/**
 * Convert an OFXImage from byte (0-255) format to float (0.0-1.0) format.
 */
export function convertByteToFloat(image: OFXImage): OFXImage {
  if (image.bitDepth === OFXBitDepth.Float) return image;

  const src = new Uint8Array(image.data);
  const width  = image.bounds.x2 - image.bounds.x1;
  const height = image.bounds.y2 - image.bounds.y1;
  const channels = image.components === OFXImageComponent.RGBA ? 4
    : image.components === OFXImageComponent.RGB ? 3 : 1;
  const floatRowBytes = width * channels * 4; // 4 bytes per float32
  const dst = new Float32Array(width * height * channels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        const srcIdx = y * image.rowBytes + x * channels + c;
        const dstIdx = y * width * channels + x * channels + c;
        dst[dstIdx] = src[srcIdx] / 255;
      }
    }
  }

  return {
    ...image,
    data: dst.buffer,
    rowBytes: floatRowBytes,
    bitDepth: OFXBitDepth.Float,
    uniqueId: `${image.uniqueId}_float`,
  };
}

/**
 * Convert an OFXImage from float (0.0-1.0) format to byte (0-255) format.
 */
export function convertFloatToByte(image: OFXImage): OFXImage {
  if (image.bitDepth === OFXBitDepth.Byte) return image;

  const src = new Float32Array(image.data);
  const width  = image.bounds.x2 - image.bounds.x1;
  const height = image.bounds.y2 - image.bounds.y1;
  const channels = image.components === OFXImageComponent.RGBA ? 4
    : image.components === OFXImageComponent.RGB ? 3 : 1;
  const byteRowBytes = width * channels;
  const dst = new Uint8Array(width * height * channels);

  for (let y = 0; y < height; y++) {
    const srcPixelsPerRow = image.rowBytes / 4; // 4 bytes per float32
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        const srcIdx = y * srcPixelsPerRow + x * channels + c;
        const dstIdx = y * byteRowBytes + x * channels + c;
        dst[dstIdx] = clampByte(src[srcIdx] * 255);
      }
    }
  }

  return {
    ...image,
    data: dst.buffer,
    rowBytes: byteRowBytes,
    bitDepth: OFXBitDepth.Byte,
    uniqueId: `${image.uniqueId}_byte`,
  };
}

/**
 * Create an empty pre-allocated OFXImage of the given dimensions and format.
 */
export function createEmptyOFXImage(
  width: number,
  height: number,
  components: OFXImageComponentId = OFXImageComponent.RGBA,
  bitDepth: OFXBitDepthId = OFXBitDepth.Byte,
): OFXImage {
  const channels = components === OFXImageComponent.RGBA ? 4
    : components === OFXImageComponent.RGB ? 3 : 1;
  const bytesPerComponent = bitDepth === OFXBitDepth.Float ? 4
    : bitDepth === OFXBitDepth.Half ? 2
    : bitDepth === OFXBitDepth.Short ? 2 : 1;
  const rowBytes = width * channels * bytesPerComponent;
  const totalBytes = rowBytes * height;

  return {
    data: new ArrayBuffer(totalBytes),
    rowBytes,
    bounds: { x1: 0, y1: 0, x2: width, y2: height },
    pixelAspectRatio: 1.0,
    components,
    bitDepth,
    uniqueId: `empty_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}


// =============================================================================
//  6. IPC Bridge (Electron Renderer <-> Main Process)
// =============================================================================

/**
 * Message types for the OFX IPC protocol between renderer and main process.
 */
export type OFXIPCRequest =
  | { type: 'ofx:scan-plugins';    payload: { paths: string[] } }
  | { type: 'ofx:load-plugin';     payload: { bundlePath: string } }
  | { type: 'ofx:describe-plugin'; payload: { pluginId: string } }
  | { type: 'ofx:unload-plugin';   payload: { pluginId: string } }
  | { type: 'ofx:create-instance'; payload: { pluginId: string; instanceId: string } }
  | { type: 'ofx:destroy-instance'; payload: { nativeHandle: string } }
  | { type: 'ofx:set-param';       payload: { nativeHandle: string; paramName: string; value: unknown } }
  | { type: 'ofx:render';          payload: {
      nativeHandle: string;
      inputImage: OFXImageTransfer;
      outputImage: OFXImageTransfer;
      renderArgs: OFXRenderArgs;
    } };

export type OFXIPCResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * A transferable representation of an OFXImage suitable for structured clone.
 * ArrayBuffers are listed in the transfer list for zero-copy IPC.
 */
export interface OFXImageTransfer {
  data: ArrayBuffer;
  rowBytes: number;
  bounds: OFXRect;
  pixelAspectRatio: number;
  components: OFXImageComponentId;
  bitDepth: OFXBitDepthId;
  uniqueId: string;
}

/**
 * IPC bridge that communicates with the Electron main process for native
 * OFX operations. Uses ipcRenderer.invoke for request/response and
 * structured clone for efficient image buffer transfer.
 */
export class OFXIPCBridge {
  private ipcRenderer: ElectronIpcRenderer | null = null;
  private pendingRenders: Map<string, {
    resolve: (value: OFXImage) => void;
    reject: (reason: Error) => void;
  }> = new Map();

  private initialized = false;

  /**
   * Initialize the bridge. Must be called after the Electron preload script
   * has exposed ipcRenderer.
   */
  initialize(): boolean {
    if (this.initialized) return true;

    // Check for Electron's contextBridge-exposed IPC.
    const electronIpc = getElectronIpc();
    if (!electronIpc) {
      console.warn('[OFXIPCBridge] Not in Electron environment; OFX bridge disabled');
      return false;
    }

    this.ipcRenderer = electronIpc;
    this.initialized = true;

    // Listen for async render completions.
    this.ipcRenderer.on('ofx:render-complete', ((...args: unknown[]) => {
      const [_event, response] = args as [unknown, OFXIPCResponse<OFXImage>];
      // The render ID is embedded in the response for correlation.
      const renderId = (response as any).renderId as string | undefined;
      if (!renderId) return;

      const pending = this.pendingRenders.get(renderId);
      if (!pending) return;

      this.pendingRenders.delete(renderId);
      if (response.success) {
        pending.resolve(response.data as OFXImage);
      } else {
        pending.reject(new Error((response as { success: false; error: string }).error));
      }
    }) as (...args: unknown[]) => void);

    console.log('[OFXIPCBridge] Initialized');
    return true;
  }

  /** Whether the bridge is connected to Electron. */
  isAvailable(): boolean {
    return this.initialized && this.ipcRenderer !== null;
  }

  /**
   * Send a synchronous-style invoke to the main process and await the response.
   * Uses Electron's ipcRenderer.invoke which returns a Promise.
   */
  async invoke<T>(channel: string, payload: unknown): Promise<T> {
    if (!this.ipcRenderer) {
      throw new Error('[OFXIPCBridge] Not initialized');
    }

    const response = await this.ipcRenderer.invoke(channel, payload) as OFXIPCResponse<T>;
    if (!response.success) {
      throw new Error(`[OFXIPCBridge] ${channel} failed: ${(response as { success: false; error: string }).error}`);
    }

    return response.data;
  }

  /**
   * Submit an asynchronous render request. The render will be executed on
   * the main process and the result delivered via the 'ofx:render-complete'
   * event.
   *
   * @desktopOnly
   */
  async submitAsyncRender(
    nativeHandle: string,
    inputImage: OFXImage,
    outputImage: OFXImage,
    renderArgs: OFXRenderArgs,
  ): Promise<OFXImage> {
    if (!this.ipcRenderer) {
      throw new Error('[OFXIPCBridge] Not initialized');
    }

    const renderId = `render_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const promise = new Promise<OFXImage>((resolve, reject) => {
      this.pendingRenders.set(renderId, { resolve, reject });

      // Set a timeout to avoid hanging forever.
      setTimeout(() => {
        if (this.pendingRenders.has(renderId)) {
          this.pendingRenders.delete(renderId);
          reject(new Error(`[OFXIPCBridge] Render timeout for ${renderId}`));
        }
      }, 30_000);
    });

    // Send the render request with transferable ArrayBuffers.
    const inputTransfer = prepareImageForTransfer(inputImage);
    const outputTransfer = prepareImageForTransfer(outputImage);

    this.ipcRenderer.send('ofx:render-async', {
      renderId,
      nativeHandle,
      inputImage: inputTransfer,
      outputImage: outputTransfer,
      renderArgs,
    });

    return promise;
  }

  /**
   * Destroy all pending renders and release resources.
   */
  dispose(): void {
    for (const [, pending] of this.pendingRenders) {
      pending.reject(new Error('[OFXIPCBridge] Bridge disposed'));
    }
    this.pendingRenders.clear();
    this.ipcRenderer = null;
    this.initialized = false;
  }
}

// ─── Electron IPC type stub ─────────────────────────────────────────────────

/** Minimal subset of Electron's ipcRenderer used by the bridge. */
interface ElectronIpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (...args: unknown[]) => void): void;
}


// =============================================================================
//  Internal Helpers
// =============================================================================

/** Registry mapping app instance IDs to their native OFX handles. */
interface OFXInstanceEntry {
  pluginId: string;
  nativeHandle: string;
  appInstance: EffectInstance;
}

const ofxInstanceRegistry: Map<string, OFXInstanceEntry> = new Map();

/** Global IPC bridge singleton. */
let ipcBridgeInstance: OFXIPCBridge | null = null;

/**
 * Get or lazily create the global OFX IPC bridge.
 * Returns null if not running in Electron.
 */
function getIPCBridge(): OFXIPCBridge | null {
  if (ipcBridgeInstance) return ipcBridgeInstance.isAvailable() ? ipcBridgeInstance : null;

  ipcBridgeInstance = new OFXIPCBridge();
  const ok = ipcBridgeInstance.initialize();
  return ok ? ipcBridgeInstance : null;
}

/**
 * Attempt to get Electron's ipcRenderer from the window object.
 * The preload script should expose it via contextBridge.
 */
function getElectronIpc(): ElectronIpcRenderer | null {
  if (typeof window === 'undefined') return null;

  // Check for contextBridge-exposed API.
  const win = window as any;
  if (win.electronOFX?.ipcRenderer) {
    return win.electronOFX.ipcRenderer;
  }
  // Fallback: direct ipcRenderer (less secure, for dev only).
  if (win.require) {
    try {
      const electron = win.require('electron');
      return electron.ipcRenderer ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Prepare an OFXImage for structured clone transfer. */
function prepareImageForTransfer(image: OFXImage): OFXImageTransfer {
  return {
    data: image.data,
    rowBytes: image.rowBytes,
    bounds: { ...image.bounds },
    pixelAspectRatio: image.pixelAspectRatio,
    components: image.components,
    bitDepth: image.bitDepth,
    uniqueId: image.uniqueId,
  };
}

/** Clamp a value to the 0-255 byte range. */
function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Compute a reasonable step value for a numeric range. */
function computeStep(min?: number, max?: number): number {
  if (min === undefined || max === undefined) return 0.01;
  const range = Math.abs(max - min);
  if (range <= 1) return 0.001;
  if (range <= 10) return 0.01;
  if (range <= 100) return 0.1;
  if (range <= 1000) return 1;
  return 10;
}

/** Convert OFX RGBA floats (0-1) to a hex color string. */
function rgbaToHex(r: number, g: number, b: number, _a: number): string {
  const toHex = (v: number) => clampByte(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Map an OFX grouping path (e.g. "Color/Correction") to an app category. */
function mapGroupingToCategory(grouping: string): string {
  if (!grouping) return 'OFX';

  // Use the first segment of the grouping path.
  const firstSegment = grouping.split('/')[0].trim();

  // Map common OFX groupings to existing app categories.
  const mapping: Record<string, string> = {
    'Color':       'Color',
    'Colour':      'Color',
    'Filter':      'Blur',
    'Blur':        'Blur',
    'Stylize':     'Stylize',
    'Style':       'Stylize',
    'Distort':     'Distort',
    'Transform':   'Transform',
    'Transition':  'Morph',
    'Generate':    'Generate',
    'Generator':   'Generate',
    'Composite':   'Composite',
    'Keying':      'Composite',
    'Key':         'Composite',
    'Matte':       'Composite',
    'Time':        'Transform',
    'Audio':       'Audio',
  };

  return mapping[firstSegment] ?? `OFX/${firstSegment}`;
}

/** Serialize a parameter value for IPC transfer. */
function serializeParamValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) return value;
  // For color values that are hex strings, pass through.
  return value;
}


// =============================================================================
//  Exported Singleton Instances
// =============================================================================

/** Singleton suite implementations for host-side OFX support. */
export const ofxPropertySuite     = new OFXPropertySuiteImpl();
export const ofxImageEffectSuite  = new OFXImageEffectSuiteImpl();
export const ofxParameterSuite    = new OFXParameterSuiteImpl();
export const ofxMemorySuite       = new OFXMemorySuiteImpl();
export const ofxMultiThreadSuite  = new OFXMultiThreadSuiteImpl();
export const ofxMessageSuite      = new OFXMessageSuiteImpl();

/** The global OFX IPC bridge instance. */
export const ofxBridge = new OFXIPCBridge();

/** Registry of loaded OFX plugins. */
export const ofxPluginRegistry: Map<string, OFXPlugin> = new Map();

/**
 * Convenience function: scan, load, describe, and register all OFX plugins
 * found in the standard directories.
 *
 * @desktopOnly Requires Electron for filesystem and native module access.
 * @param paths - Optional custom plugin search paths.
 * @returns Array of registered EffectDefinitions for discovered plugins.
 */
export async function initializeOFXPlugins(paths?: string[]): Promise<EffectDefinition[]> {
  const bundles = await scanPluginDirectories(paths);
  const definitions: EffectDefinition[] = [];

  for (const bundle of bundles) {
    try {
      const plugin = await loadPlugin(bundle.path);
      const descriptor = await describePlugin(plugin.id);
      plugin.effectDescriptor = descriptor;
      ofxPluginRegistry.set(plugin.id, plugin);

      const def = registerOFXPlugin(plugin);
      if (def) {
        definitions.push(def);
        console.log(`[OpenFXBridge] Registered plugin: ${def.name} (${def.id})`);
      }
    } catch (err) {
      console.error(`[OpenFXBridge] Failed to load plugin at "${bundle.path}":`, err);
    }
  }

  console.log(`[OpenFXBridge] Initialized ${definitions.length} OFX plugin(s)`);
  return definitions;
}

/**
 * Tear down all OFX plugins and release resources.
 *
 * @desktopOnly
 */
export async function shutdownOFXPlugins(): Promise<void> {
  // Destroy all instances.
  for (const [instanceId, entry] of ofxInstanceRegistry) {
    try {
      const ipc = getIPCBridge();
      if (ipc) {
        await ipc.invoke('ofx:destroy-instance', { nativeHandle: entry.nativeHandle });
      }
    } catch (err) {
      console.warn(`[OpenFXBridge] Failed to destroy instance ${instanceId}:`, err);
    }
  }
  ofxInstanceRegistry.clear();

  // Unload all plugins.
  for (const [pluginId] of ofxPluginRegistry) {
    try {
      await unloadPlugin(pluginId);
    } catch (err) {
      console.warn(`[OpenFXBridge] Failed to unload plugin ${pluginId}:`, err);
    }
    effectsEngine.unregisterDefinition(`ofx:${pluginId}`);
  }
  ofxPluginRegistry.clear();

  // Release suite resources.
  ofxMemorySuite.purge();
  ofxImageEffectSuite.clearAll();
  ofxMessageSuite.clearLog();

  // Dispose bridge.
  ofxBridge.dispose();

  console.log('[OpenFXBridge] Shutdown complete');
}
