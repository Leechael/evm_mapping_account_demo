import { ApiPromise, SubmittableResult } from '@polkadot/api';
import { ApiTypes, Signer } from '@polkadot/api/types';
import { SubmittableExtrinsic, AddressOrPair } from '@polkadot/api-base/types/submittable';
import { WalletClient, TestClient, Account, Address, Hex } from 'viem';
import { signTypedData } from 'viem/wallet';

type SignTypedDataInput = Parameters<typeof signTypedData>[1];
/**
 * Get compressed formatted ether address for a specified account via a Wallet Client.
 */
declare function etherAddressToCompressedPubkey(client: WalletClient | TestClient, account: Account, msg?: string): Promise<`0x${string}`>;
interface EtherAddressToSubstrateAddressOptions {
    SS58Prefix?: number;
    msg?: string;
}
interface Eip712Domain {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
}
declare function createEip712Domain(api: ApiPromise): Eip712Domain;
interface SubstrateCall {
    who: string;
    callData: string;
    nonce: number;
}
declare function createSubstrateCall<T extends ApiTypes>(api: ApiPromise, substrateAddress: string, extrinsic: SubmittableExtrinsic<T>): Promise<{
    who: string;
    callData: `0x${string}`;
    nonce: number;
}>;
/**
 * @params account Account  The viem WalletAccount instance for signging.
 * @params who string       The SS58 formated address of the account.
 * @params callData string  The encoded call data, usually create with `api.tx.foo.bar.inner.toHex()`
 * @params nonce number     The nonce of the account.
 */
declare function createEip712StructedDataSubstrateCall(account: Account, domain: Eip712Domain, message: SubstrateCall): SignTypedDataInput;
interface MappingAccount {
    evmAddress: Address;
    compressedPubkey: Hex;
    address: Address;
}
declare function getMappingAccount(client: WalletClient, account: Account | {
    address: `0x${string}`;
}, { SS58Prefix, msg }?: EtherAddressToSubstrateAddressOptions): Promise<MappingAccount>;
declare class SignAndSendError extends Error {
    readonly isCancelled: boolean;
}
declare function callback<TSubmittableResult>(resolve: (value: TSubmittableResult) => void, reject: (reason?: any) => void, result: SubmittableResult, unsub?: any): void;
declare function signAndSend<TSubmittableResult extends SubmittableResult = SubmittableResult>(target: SubmittableExtrinsic<ApiTypes, TSubmittableResult>, pair: AddressOrPair): Promise<TSubmittableResult>;
declare function signAndSend<TSubmittableResult extends SubmittableResult = SubmittableResult>(target: SubmittableExtrinsic<ApiTypes, TSubmittableResult>, address: AddressOrPair, signer: Signer): Promise<TSubmittableResult>;
declare function signAndSendEvm<TSubmittableResult extends SubmittableResult = SubmittableResult>(extrinsic: SubmittableExtrinsic<'promise'>, apiPromise: ApiPromise, client: WalletClient, account: MappingAccount): Promise<TSubmittableResult>;

export { type Eip712Domain, type EtherAddressToSubstrateAddressOptions, type MappingAccount, SignAndSendError, type SubstrateCall, callback, createEip712Domain, createEip712StructedDataSubstrateCall, createSubstrateCall, etherAddressToCompressedPubkey, getMappingAccount, signAndSend, signAndSendEvm };
