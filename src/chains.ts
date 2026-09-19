// Static native-currency table for the amount and chainId formats. Nothing is fetched;
// a fixture's chain entry always overrides this table. Extend deliberately.
export interface ChainInfo {name: string; nativeCurrency: {name: string; symbol: string; decimals: number}}
const eth = (name: string): ChainInfo => ({name, nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18}});
export const KNOWN_CHAINS: Record<number, ChainInfo> = {
  1: eth('Ethereum Mainnet'),
  10: eth('OP Mainnet'),
  56: {name: 'BNB Smart Chain', nativeCurrency: {name: 'BNB', symbol: 'BNB', decimals: 18}},
  100: {name: 'Gnosis', nativeCurrency: {name: 'xDAI', symbol: 'xDAI', decimals: 18}},
  137: {name: 'Polygon', nativeCurrency: {name: 'POL', symbol: 'POL', decimals: 18}},
  143: {name: 'Monad', nativeCurrency: {name: 'Monad', symbol: 'MON', decimals: 18}},
  8453: eth('Base'),
  10143: {name: 'Monad Testnet', nativeCurrency: {name: 'Monad', symbol: 'MON', decimals: 18}},
  31337: eth('Anvil'),
  42161: eth('Arbitrum One'),
  43114: {name: 'Avalanche C-Chain', nativeCurrency: {name: 'AVAX', symbol: 'AVAX', decimals: 18}},
  59144: eth('Linea'),
  534352: eth('Scroll'),
  11155111: eth('Sepolia'),
};
