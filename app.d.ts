/// <reference types="nativewind/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: 'development' | 'production' | 'test';
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_LIVEKIT_WS_URL?: string;
    EXPO_PUBLIC_INVITE_WEB_URL?: string;
    EXPO_PUBLIC_DEEP_LINK_SCHEME?: string;
    [key: string]: string | undefined;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
