'use client';

import { ApiPromise, WsProvider, Keyring } from '@polkadot/api'
import type { u16 } from '@polkadot/types'
import { atom, useSetAtom, useAtomValue, type Getter } from 'jotai'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { WagmiConfig, createConfig, useAccount, useConnect, useWalletClient } from 'wagmi'
import { InjectedConnector } from 'wagmi/connectors/injected'

import { getMappingAccount, type MappingAccount, signAndSend, signAndSendEvm } from '@/evm_mapping_sdk'

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
    async (get, set, action: { type: 'connect' }) => {
      if (action.type === 'connect') {
        set(innerAtom, { connected: false, connecting: true, instance: null })
        const instance = await connect(get)
        if (!instance) {
          set(innerAtom, { connected: false, connecting: false, instance: null })
        } else {
          set(innerAtom, { connected: true, connecting: false, instance })
        }
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

const apiPromiseAtom = atomWithConnectState(
  async function () {
    const apiPromise = await ApiPromise.create({
      provider: new WsProvider('ws://10.0.0.120:9944'),
      noInitWarn: true,
    })
    return apiPromise
  },
  { autoConnect: true }
)

const mappedAccountAtom = atom<MappingAccount | null>(null)

// https://poc6-statescan.phala.network/extrinsics/{trxId}
const blockExplorerAtom = atom('https://poc6-statescan.phala.network')

//
// Components
//

function RpcInput() {
  return (
    <div>
      <label htmlFor="email" className="sr-only">
        Email
      </label>
      <input
        type="email"
        name="email"
        id="email"
        className="block w-full rounded-md border-0 px-2.5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
        placeholder="you@example.com"
      />
    </div>
  )
}

const connector = new InjectedConnector()

/**
 * Prompt the user to connect their wallet and request signing for compressed pubkey.
 */
function ConnectButton() {
  const { instance: apiPromise } = useAtomValue(apiPromiseAtom)
  const setMappingAccount = useSetAtom(mappedAccountAtom)
  const account = useAccount()
  const { connect } = useConnect({ connector })
  const { data: walletClient } = useWalletClient()
  console.log('account', walletClient)
  return (
    <button
      onClick={async () => {
        if (account.isConnected && walletClient && account.address && apiPromise) {
          const SS58Prefix = (apiPromise.consts.system?.ss58Prefix as u16).toNumber()
          console.log('SS58Prefix', SS58Prefix)
          const mappedAccount = await getMappingAccount(walletClient, { address: account.address }, { SS58Prefix })
          setMappingAccount(mappedAccount)
        } else {
          connect()
        }
      }}
    >
      Connect
    </button>
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
              <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                <dt className="text-sm font-medium leading-6 text-gray-900 flex items-center">EVM Address</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0 font-mono overflow-x-scroll md:overflow-auto scroll-smooth py-2">
                  {mappedAccount.evmAddress}
                </dd>
              </div>
              <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
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

function ClaimTestToken() {
  const { instance: apiPromise } = useAtomValue(apiPromiseAtom)
  const mappedAccount = useAtomValue(mappedAccountAtom)
  return (
    <button
      onClick={async () => {
        const keyring = new Keyring({ type: 'sr25519' })
        const alice = keyring.addFromUri('//Alice')
        if (apiPromise && mappedAccount) {
          const result = await signAndSend(apiPromise.tx.balances.transferAllowDeath(mappedAccount.address, 1e12 * 100), alice)
          const trxId = result.status.asInBlock.toHex()
          console.log('trxId', trxId)
        }
      }}
    >
      Claim Test Tokens
    </button>
  )
}

function TransferToAddress() {
  const { instance: apiPromise } = useAtomValue(apiPromiseAtom)
  const mappedAccount = useAtomValue(mappedAccountAtom)
  const { data: walletClient } = useWalletClient()
  return (
    <form onSubmit={async (ev) => {
      ev.preventDefault()
      const data = Array.from(new FormData(ev.target as HTMLFormElement).entries()).reduce((acc, [key, value]) => {
        acc[key] = value as string
        return acc
      }, {} as Record<string, string>)
      if (!apiPromise || !mappedAccount || !walletClient) {
        return
      }
      const result = await signAndSendEvm(
        apiPromise.tx.balances.transferAllowDeath(data.address, 1e12 * 100),
        apiPromise,
        walletClient,
        mappedAccount,
      )
      const trxId = result.status.asInBlock.toHex()
      console.log(trxId)
    }}>
      <input
        type="text"
        name="address"
        className="block w-full rounded-md border-0 px-2.5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
        placeholder="substrate address"
      />
      <input
        type="number"
        name="amount"
        className="block w-full rounded-md border-0 px-2.5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
        placeholder="1 tokens"
      />
      <button type="submit">transfer</button>
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
      <div className="w-full md:min-w-[600px] md:max-w-4xl">
        <RpcInput />
        <ConnectButton />
        <MappingAddress />
        <ClaimTestToken />
        <TransferToAddress />
      </div>
    </WagmiConfig>
  )
} 
