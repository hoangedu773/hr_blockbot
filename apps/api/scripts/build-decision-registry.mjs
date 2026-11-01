import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

// Compile only. Never load a wallet/private key, connect RPC or deploy.
const sourcePath = fileURLToPath(new URL('../../../packages/contracts/solidity/AssignmentDecisionRegistry.sol', import.meta.url));
const target = fileURLToPath(new URL('../artifacts/AssignmentDecisionRegistry.json', import.meta.url));
const output = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources: { 'AssignmentDecisionRegistry.sol': { content: fs.readFileSync(sourcePath, 'utf8') } },
  settings: { evmVersion: 'shanghai', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } },
})));
const errors = (output.errors ?? []).filter((entry) => entry.severity === 'error');
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
const artifact = output.contracts['AssignmentDecisionRegistry.sol'].AssignmentDecisionRegistry;
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({ compiler: solc.version(), evmVersion: 'shanghai', abi: artifact.abi,
  bytecode: '0x' + artifact.evm.bytecode.object, deployedBytecode: '0x' + artifact.evm.deployedBytecode.object }, null, 2));
console.log('Compiled registry artifact:', target);
console.log('No deployment or Blockchain transaction has been performed.');
