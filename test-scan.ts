import { scanRepoSignals } from './src/services/repoScan';
const signals = scanRepoSignals('/Users/davidsoderman/Documents/HiQ/Moderaterna');
console.log('API Endpoints:', signals.apiEndpoints);
