import { watch, FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import { resolve } from 'path';
import { parseSchemaFile } from './parser.js';
import { generateConstraintCode, writeGeneratedCode } from './codegen.js';

export interface WatcherOptions {
  schemaPath: string;
  outputDir: string;
  debounceMs?: number;
}

export interface WatcherEvents {
  'change': (filePath: string) => void;
  'generated': (outputDir: string) => void;
  'error': (error: Error) => void;
}

/**
 * File watcher that monitors schema files and regenerates constraint code
 */
export class SchemaWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private options: Required<WatcherOptions>;

  constructor(options: WatcherOptions) {
    super();
    this.options = {
      debounceMs: 1000,
      ...options,
    };
  }

  /**
   * Start watching the schema file
   */
  start(): void {
    const resolvedSchemaPath = resolve(this.options.schemaPath);
    
    this.watcher = watch(resolvedSchemaPath, {
      persistent: true,
      ignoreInitial: false, // Generate on startup
    });

    this.watcher.on('change', (filePath) => {
      this.emit('change', filePath);
      this.debouncedGenerate();
    });

    this.watcher.on('add', (filePath) => {
      this.emit('change', filePath);
      this.debouncedGenerate();
    });

    this.watcher.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Generate constraint code with debouncing
   */
  private debouncedGenerate(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.generate();
    }, this.options.debounceMs);
  }

  /**
   * Generate constraint code immediately
   */
  private async generate(): Promise<void> {
    try {
      const resolvedSchemaPath = resolve(this.options.schemaPath);
      const resolvedOutputDir = resolve(this.options.outputDir);

      // Parse schema
      const schema = parseSchemaFile(resolvedSchemaPath);
      
      // Generate code
      const code = generateConstraintCode(schema);
      
      // Write generated code
      writeGeneratedCode(code, resolvedOutputDir);
      
      this.emit('generated', resolvedOutputDir);
    } catch (error) {
      this.emit('error', error as Error);
    }
  }
}

/**
 * Convenience function to create and start a watcher
 */
export function createWatcher(options: WatcherOptions): SchemaWatcher {
  const watcher = new SchemaWatcher(options);
  watcher.start();
  return watcher;
}