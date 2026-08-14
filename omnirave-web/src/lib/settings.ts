export type UiThemeName = 'Obsidian Glass' | 'Luminous Panels' | 'Hybrid Premium';
export type GraphicsMode = 'auto' | 'manual';
export type CameraFollowMode = 'auto-follow' | 'free';
export type CrouchMode = 'hold' | 'toggle';

export interface RuntimeSettings {
  uiTheme: UiThemeName;
  graphicsMode: GraphicsMode;
  graphicsLevel: number;
  displayNames: boolean;
  chatCollapsed: boolean;
  crouchMode: CrouchMode;
  cameraFollow: CameraFollowMode;
}

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  uiTheme: 'Luminous Panels',
  graphicsMode: 'auto',
  graphicsLevel: 7,
  displayNames: true,
  chatCollapsed: false,
  crouchMode: 'hold',
  cameraFollow: 'free',
};

export function normalizeRuntimeSettings(settings?: Partial<RuntimeSettings> | null): RuntimeSettings {
  return {
    ...DEFAULT_RUNTIME_SETTINGS,
    ...settings,
  };
}
