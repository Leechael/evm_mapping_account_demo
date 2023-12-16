'use client';

import { useState, useEffect } from 'react'
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api'
import type { u16, u32, u128, Struct } from '@polkadot/types'
import { atom, useAtom, useSetAtom, useAtomValue, type Getter, type Atom } from 'jotai'
import { createPublicClient, http, custom, createWalletClient } from 'viem'
import { mainnet } from 'viem/chains'
import { WagmiConfig, createConfig, useAccount, useConnect, useWalletClient } from 'wagmi'
import { InjectedConnector } from 'wagmi/connectors/injected'
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/20/solid'

import { getMappingAccount, type MappingAccount, signAndSend, signAndSendEvm } from '@/evm_mapping_sdk'

//
// types
//

export interface FrameSystemAccountInfo extends Struct {
  readonly nonce: u32
  readonly consumers: u32
  readonly providers: u32
  readonly sufficients: u32
  readonly data: PalletBalancesAccountData
}

interface PalletBalancesAccountData extends Struct {
  readonly free: u128
  readonly reserved: u128
  readonly frozen: u128
  readonly flags: u128
}

//
// Atoms
//

type ConnectState<TInstance = unknown> = {
  connected: false
  connecting: false
  instance?: null | undefined
} | {
  connected: false
  connecting: true
  instance?: null | undefined
} | {
  connected: true
  connecting: false
  instance: TInstance
}

interface AtomWithConnectStateOptions {
  autoConnect?: boolean
}

function atomWithConnectState<
  T
>(
  connect: (get: Getter) => Promise<T | undefined | null>,
  options?: AtomWithConnectStateOptions
) {
  const innerAtom = atom<ConnectState<T>>({ connected: false, connecting: false, instance: null })
  const outerAtom = atom(
    get => get(innerAtom),
    async (get, set, action: { type: 'connect' | 'disconnect' }) => {
      if (action.type === 'connect') {
        set(innerAtom, { connected: false, connecting: true, instance: null })
        const instance = await connect(get)
        if (!instance) {
          set(innerAtom, { connected: false, connecting: false, instance: null })
        } else {
          set(innerAtom, { connected: true, connecting: false, instance })
        }
        return instance
      }
      if (action.type === 'disconnect') {
        const prev = get(innerAtom)
        if (prev.instance) {
          // @ts-ignore
          prev.instance.disconnect()
        }
        set(innerAtom, { connected: false, connecting: false, instance: null })
      }
    }
  )
  if (options?.autoConnect) {
    outerAtom.onMount = (set) => {
      if (typeof window !== 'undefined') {
        set({ type: 'connect' })
      }
    }
  }
  return outerAtom
}

const rpcAtom = atom('wss://poc6.phala.network/ws')

const apiPromiseAtom = atomWithConnectState(
  async function (get) {
    const endpoint = get(rpcAtom)
    const apiPromise = await ApiPromise.create({
      provider: new WsProvider(endpoint),
      noInitWarn: true,
    })
    return apiPromise
  },
  // { autoConnect: true }
)

const mappedAccountAtom = atom<MappingAccount | null>(null)

// https://poc6-statescan.phala.network/extrinsics/{trxId}
const blockExplorerAtom = atom('https://poc6-statescan.phala.network')

const isSupportedAtom = atom(true)

//
// Components
//

function Spinner() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 animate-spin">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  )
}

function RpcInput() {
  const [rpc, setRpc] = useAtom(rpcAtom)
  return (
    <div>
      <label htmlFor="email" className="sr-only">
        WS Endpoint
      </label>
      <input
        name="rpc"
        id="rpc"
        value={rpc}
        onChange={ev => setRpc(ev.target.value)}
        className="block w-full rounded-md border-0 px-2.5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
        placeholder="ws://127.0.0.1:9944"
      />
    </div>
  )
}

function BlockExploerInput() {
  const [blockExplorer, setBlockExplorer] = useAtom(blockExplorerAtom)
  return (
    <div>
      <label htmlFor="email" className="sr-only">
        WS Endpoint
      </label>
      <input
        name="rpc"
        id="rpc"
        className="block w-full rounded-md border-0 px-2.5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
        value={blockExplorer}
        onChange={ev => setBlockExplorer(ev.target.value)}
      />
    </div>
  )
}

const connector = new InjectedConnector()

/**
 * Prompt the user to connect their wallet and request signing for compressed pubkey.
 */
function ConnectButton() {
  const [{ instance: apiPromise }, dispatch] = useAtom(apiPromiseAtom)
  const setMappingAccount = useSetAtom(mappedAccountAtom)
  const account = useAccount()
  const { connect } = useConnect({ connector })
  const [isPending, setIsPending] = useState(false)
  const setIsSupport = useSetAtom(isSupportedAtom)
  return (
    <button
      className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      onClick={async () => {
        try {
          setIsPending(true)
          if (!account.isConnected) {
            connect()
          }
          let _api = apiPromise
          if (_api) {
            await dispatch({ type: 'disconnect' })
          }
          _api = await dispatch({ type: 'connect' })
          if (!_api!.consts?.evmAccountMapping?.eip712ChainID) {
            setIsSupport(false)
            return
          }
          const walletClient = createWalletClient({ chain: mainnet, transport: custom((window as any).ethereum) })
          const SS58Prefix = (_api!.consts.system?.ss58Prefix as u16).toNumber()
          const mappedAccount = await getMappingAccount(walletClient, { address: account.address! }, { SS58Prefix })
          setMappingAccount(mappedAccount)
          setIsSupport(true)
        } finally {
          setIsPending(false)
        }
      }}
    >
      {isPending ? (
        <Spinner />
      ) : "Connect"}
    </button>
  )
}

function SupportedStatement() {
  const isSupported = useAtomValue(isSupportedAtom)
  const { connected } = useAtomValue(apiPromiseAtom)
  if (isSupported || !connected) {
    return null
  }
  return (
    <div className="rounded-md bg-red-50 p-4 mx-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <ExclamationCircleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">Unsupported Chain</h3>
          <div className="mt-2 text-sm text-red-700">
            <p>This chain since don&apos;t include evm_account_mapping pallet</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MappingAddress() {
  const mappedAccount = useAtomValue(mappedAccountAtom)
  if (!mappedAccount) {
    return null
  }
  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-base font-semibold leading-6 text-gray-900">Mapping Account</h3>
        <div className="mt-2 max-w-xl text-sm text-gray-500">
          <div className="mt-6 border-t border-gray-100 md:min-w-[640px]">
            <dl className="divide-y divide-gray-100">
              <div className="px-4 py-2.5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt className="text-sm font-medium leading-6 text-gray-900 flex items-center">EVM Address</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0 font-mono overflow-x-scroll md:overflow-auto scroll-smooth py-2">
                  {mappedAccount.evmAddress}
                </dd>
              </div>
              <div className="px-4 py-2.5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt className="text-sm font-medium leading-6 text-gray-900 flex items-center">Mapping Substrate Address</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0 font-mono overflow-x-scroll md:overflow-auto scroll-smooth py-2">
                  {mappedAccount.address}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

const formatter = new Intl.NumberFormat('en-US')

const claimTestTokenTrxIdAtom = atom('')

function AccountBalance() {
  const { instance: apiPromise } = useAtomValue(apiPromiseAtom)
  const mappedAccount = useAtomValue(mappedAccountAtom)
  const [balance, setBalance] = useState(BigInt(0))
  useEffect(() => {
    if (!apiPromise || !mappedAccount) {
      return
    }
    let unsub: any = () => {}
    (async function() {
      unsub = await apiPromise.query.system.account(
        mappedAccount.address,
        (info: FrameSystemAccountInfo) => setBalance(info.data.free.toBigInt()))
    })()
    return () => {
      setBalance(BigInt(0))
      unsub && unsub()
    }
  }, [apiPromise, mappedAccount, setBalance])
  return (
    <div>
      <div>Balance: {formatter.format(Number(balance / BigInt(1e8)) / 1e4)} Unit</div>
    </div>
  )
}

function ClaimTestToken() {
  const { instance: apiPromise } = useAtomValue(apiPromiseAtom)
  const mappedAccount = useAtomValue(mappedAccountAtom)
  const [isPending, setIsPending] = useState(false)
  const setTrxId = useSetAtom(claimTestTokenTrxIdAtom)
  if (!apiPromise || !mappedAccount) {
    return null
  }
  return (
    <button
      className={
        isPending
        ? "min-h-[28px] rounded-full bg-indigo-600 p-1 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        : "rounded bg-indigo-600 px-2 py-1 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      }
      onClick={async () => {
        try {
          setIsPending(true)
          setTrxId('')
          const keyring = new Keyring({ type: 'sr25519' })
          const alice = keyring.addFromUri('//Alice')
          const result = await signAndSend(apiPromise.tx.balances.transferAllowDeath(mappedAccount.address, 1e12 * 100), alice)
          const trxId = result.status.asInBlock.toHex()
          setTrxId(trxId)
        } finally {
          setIsPending(false)
        } 
      }}
    >
      {isPending ? (
        <Spinner />
      ) : "Claim Test Tokens"}
    </button>
  )
}

function ViewTrxHelpText({ theAtom }: { theAtom: Atom<string> }) {
  const trxId = useAtomValue(theAtom)
  const blockExplorer = useAtomValue(blockExplorerAtom)
  const rpc = useAtomValue(rpcAtom)
  if (!trxId) {
    return null
  }
  return (
    <div className="rounded-md bg-green-50 p-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <CheckCircleIcon className="h-5 w-5 text-green-400" aria-hidden="true" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-green-800">In Block</h3>
          <div className="mt-2 text-sm text-green-700">
            <p>Extrinsic <code>{trxId}</code> already in block.</p>
          </div>
          <div className="mt-4">
            <div className="-mx-2 -my-1.5 flex">
              <a
                href={`https://polkadot.js.org/apps/?rpc=${rpc}#/explorer/query/${trxId}`}
                target="_blank"
                className="rounded-md bg-green-50 px-2 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 focus:ring-offset-green-50"
              >
                View on Polkadot Portal
              </a>
              {blockExplorer ? (
              <a
                href={`${blockExplorer}/extrinsics/${trxId}`}
                target="_blank"
                className="ml-3 rounded-md bg-green-50 px-2 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 focus:ring-offset-green-50"
              >
                View on StateScan
              </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const transferOutTrxIdAtom = atom('')

function TransferToAddress() {
  const { instance: apiPromise } = useAtomValue(apiPromiseAtom)
  const mappedAccount = useAtomValue(mappedAccountAtom)
  const { data: walletClient } = useWalletClient()
  const [isPending, setIsPending] = useState(false)
  const setTrxId = useSetAtom(transferOutTrxIdAtom)
  const enabled = apiPromise && mappedAccount && walletClient
  return (
    <form onSubmit={async (ev) => {
      try {
        ev.preventDefault()
        const data = Array.from(new FormData(ev.target as HTMLFormElement).entries()).reduce((acc, [key, value]) => {
          acc[key] = value as string
          return acc
        }, {} as Record<string, string>)
        if (!apiPromise || !mappedAccount || !walletClient) {
          return
        }
        setIsPending(true)
        setTrxId('')
        const amount = (Number(data.amount) * 1e4).toFixed(0)
        const result = await signAndSendEvm(
          apiPromise.tx.balances.transferAllowDeath(data.address, BigInt(1e8) * BigInt(amount)),
          apiPromise,
          walletClient,
          mappedAccount,
        )
        const trxId = result.status.asInBlock.toHex()
        setTrxId(trxId)
      } finally {
        setIsPending(false)
      }
    }}>
      <div className="flex flex-row gap-2.5 items-center">
        <div className="grow">
          <div className="relative mt-2 rounded-md shadow-sm">
            <input
              disabled={!enabled}
              type="text"
              name="address"
              className="block w-full rounded-md border-0 px-2.5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              placeholder="substrate address"
            />
          </div>
        </div>
        <div>
          <div className="relative mt-2 rounded-md shadow-sm">
            <input
              disabled={!enabled}
              name="amount"
              id="amount"
              className="block w-full rounded-md border-0 py-1.5 pl-2.5 pr-12 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              placeholder="0.00"
            />
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <span className="text-gray-500 sm:text-sm">
                Unit
              </span>
            </div>
          </div>
        </div>
        <div className="mt-2">
          <button
            type="submit"
            disabled={!enabled}
            className={
              isPending
              ? "rounded-full bg-indigo-600 p-1 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              : (
                enabled
                  ? "rounded bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  : "rounded bg-gray-300 cursor-not-allowed px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              )
            }
          >
            {isPending ? (
              <Spinner />
            ) : "Transfer"}
          </button>
        </div>
      </div>
    </form>
  )
}

//
// Compose together
//

const config = createConfig({
  autoConnect: true,
  publicClient: createPublicClient({
    chain: mainnet,
    transport: http()
  }),
})

export function Stage() {
  return (
    <WagmiConfig config={config}>
      <div className="w-full md:min-w-[600px] md:max-w-4xl flex flex-col gap-4">
        <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
          EVM Account Mapping Pallet for Substrate
        </h1>

        <div className="bg-white shadow sm:rounded-lg py-5 sm:p-6 flex flex-col gap-2.5">
          <div className="flex flex-row gap-2.5 px-4">
            <div className="flex flex-col gap-2.5 grow">
              <RpcInput />
              <BlockExploerInput />
            </div>
            <div>
              <ConnectButton />
            </div>
          </div>
          <SupportedStatement />
        </div>
        <MappingAddress />
        <div className="bg-white shadow sm:rounded-lg flex flex-col gap-2.5 px-4 py-5 sm:p-6">
          <div className="flex flex-row justify-between items-center">
            <AccountBalance />
            <ClaimTestToken />
          </div>
          <ViewTrxHelpText theAtom={claimTestTokenTrxIdAtom} />
        </div>
        <div className="bg-white shadow sm:rounded-lg flex flex-col gap-2.5 px-4 py-5 sm:p-6">
          <TransferToAddress />
          <ViewTrxHelpText theAtom={transferOutTrxIdAtom} />
        </div>
      </div>
    </WagmiConfig>
  )
} 
