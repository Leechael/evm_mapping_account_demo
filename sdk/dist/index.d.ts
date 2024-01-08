import { ApiPromise, SubmittableResult } from '@polkadot/api';
import { ApiTypes, Signer } from '@polkadot/api/types';
import { SubmittableExtrinsic, AddressOrPair } from '@polkadot/api-base/types/submittable';
import { Address, WalletClient, Account } from 'viem';

interface EtherAddressToSubstrateAddressOptions {
    SS58Prefix?: number;
    msg?: string;
}
interface MappingAccount {
    evmAddress: Address;
    substrateAddress: Address;
    SS58Prefix: number;
}
declare function getMappingAccount(api: ApiPromise, client: WalletClient, account: Account | {
    address: `0x${string}`;
}, { SS58Prefix, msg }?: EtherAddressToSubstrateAddressOptions): Promise<MappingAccount>;
declare class SignAndSendError extends Error {
    readonly isCancelled: boolean;
}
declare function callback<TSubmittableResult>(resolve: (value: TSubmittableResult) => void, reject: (reason?: any) => void, result: SubmittableResult, unsub?: any): void;
declare function signAndSend<TSubmittableResult extends SubmittableResult = SubmittableResult>(target: SubmittableExtrinsic<ApiTypes, TSubmittableResult>, pair: AddressOrPair): Promise<TSubmittableResult>;
declare function signAndSend<TSubmittableResult extends SubmittableResult = SubmittableResult>(target: SubmittableExtrinsic<ApiTypes, TSubmittableResult>, address: AddressOrPair, signer: Signer): Promise<TSubmittableResult>;
declare function signAndSendEvm<TSubmittableResult extends SubmittableResult = SubmittableResult>(extrinsic: SubmittableExtrinsic<'promise'>, apiPromise: ApiPromise, client: WalletClient, account: MappingAccount): Promise<TSubmittableResult>;

export { type EtherAddressToSubstrateAddressOptions, type MappingAccount, SignAndSendError, callback, getMappingAccount, signAndSend, signAndSendEvm };
