/** GraphQL client injected by Stash goja runtime. */
declare const gql: {
  /** Execute a GraphQL query/mutation. Returns the `data` field of the response. */
  Do(query: string, variables?: Record<string, unknown>): any;
};

/** Logger injected by Stash goja runtime. */
declare const log: {
  Trace(...args: unknown[]): void;
  Debug(...args: unknown[]): void;
  Info(...args: unknown[]): void;
  Warn(...args: unknown[]): void;
  Error(...args: unknown[]): void;
  Progress(percent: number): void;
};

/** Utility functions injected by Stash goja runtime. */
declare const util: {
  Sleep(ms: number): void;
};

/** Plugin input injected by Stash goja runtime. */
declare const input: {
  Args: {
    hookContext: {
      type: string;
      input: Record<string, any>;
      [key: string]: any;
    };
    [key: string]: any;
  };
  ServerConnection: {
    Scheme: string;
    Host: string;
    Port: number;
    SessionCookie: {
      Name: string;
      Value: string;
    };
    Dir: string;
    PluginDir: string;
  };
};

// -- GQL response types used across the plugin --

interface Fingerprint {
  type: string;
  value: string;
}

interface VideoFile {
  id: string;
  path: string;
  basename: string;
  width: number;
  height: number;
  video_codec: string;
  bit_rate: number;
  size: number;
  fingerprint?: string;
  fingerprints: Fingerprint[];
}

interface Tag {
  name: string;
}

interface SceneResult {
  id: string;
  title: string;
  studio: { name: string } | null;
  date: string;
  organized: boolean;
  tags: Tag[];
  files: VideoFile[];
}

interface ScenePayload {
  sceneId: string;
  title: string;
  studio: string;
  date: string;
  fileId: string;
  file: VideoFile;
  tags: Tag[];
  destinationFolder: string;
  destinationBasename: string;
  phash: string;
}

interface PluginSettings {
  handleDuplicates: boolean;
  vrTagName: string;
}
