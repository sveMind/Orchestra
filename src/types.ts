import { Command } from 'commander';

export interface OrchestraPlugin {
  name: string;
  description: string;
  command: string;
  args?: { name: string; description: string; required?: boolean }[];
  action: (args: any) => Promise<void>;
}
