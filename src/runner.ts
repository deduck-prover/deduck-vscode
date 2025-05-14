import { spawn, ChildProcess } from 'child_process';

type RunResult = 
  | { type: 'success', output: string }
  | { type: 'error', err: ProofError };

export interface ProofError {
    lineFailed: number;
    lineChecked: number;
    state: string;
    message: string;
}

export class ProofRunner {
  private child: ChildProcess;

  constructor(cmd: string, args: string[], cwd: string) {
    this.child = spawn(cmd, args, { 
      stdio: ['pipe','pipe','pipe'],
      cwd: cwd // Use the provided working directory
    });
    this.child.on('error', err => console.error('Process error:', err));
    this.child.on('exit', (code, signal) => {
      if (code !== 0) {
        console.error(`Process exited with code ${code} and signal ${signal}`);
      } else {
        console.log(`Process exited cleanly with code ${code}`);
      }
    });
  }

  /**
   * Send the full proof script (multiple lines) to the running fol.py process.
   * Returns a Promise that resolves to either a success or error result.
   */
  run(script: string): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const onData = (chunk: Buffer) => {
        if (resolved) return;
        resolved = true;
        const buf = chunk.toString();
        this.child.stdout.off('data', onData);
        this.child.stderr.off('data', onError);
        resolve({ type: 'success', output: buf });
      };
      this.child.stdout.on('data', onData);

      const onError = (chunk: Buffer) => {
        if (resolved) return;
        resolved = true;
        const buf = chunk.toString();
        this.child.stdout.off('data', onData);
        this.child.stderr.off('data', onError);

        // Parse the buf as a JSON object
        const errorData = JSON.parse(buf) as ProofError;
        resolve({ 
            type: 'error', 
            err: errorData
        });
      };
      this.child.stderr.on('data', onError);

      // Feed entire script to fol.py
      script += "\n\x03\n";
      this.child.stdin.write(script);
    });
  }
}
