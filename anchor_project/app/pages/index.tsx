
'use client'

import { WalletMultiButton, WalletDisconnectButton } from '@solana/wallet-adapter-react-ui'
import { useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useState } from 'react'


import { EscrowProvider, useEscrow } from '../components/EscrowContext'
import BalanceDisplay from '../components/BalanceDisplay'
import CreateEscrowForm from '../components/CreateEscrowForm'
import EscrowFinder from '../components/EscrowFinder'
import MessageDisplay from '../components/MessageDisplay'
import TimeDisplay from '../components/TimeDisplay'
import LoadingSpinner from '../components/LoadingSpinner'


function HomeContent() {
  
  const { message, setMessage, loading } = useEscrow()
  const { connected, publicKey } = useWallet()
  const [mounted, setMounted] = useState(false)


  useEffect(() => {
    setMounted(true)
  }, [])

 
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  
  const getMessageType = (): 'success' | 'error' | 'info' => {
    if (message.toLowerCase().includes('success') || message.toLowerCase().includes('found')) {
      return 'success'
    } else if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
      return 'error'
    }
    return 'info'
  }

 
  return (
    
    <div className="min-h-screen bg-gray-900 py-8 px-4 sm:px-6 lg:px-8 transition-colors relative">
    
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg flex flex-col items-center gap-4">
            <LoadingSpinner size="lg" />
            <p className="text-white">Processing transaction...</p>
          </div>
        </div>
      )}

     
      <div className="max-w-4xl mx-auto space-y-8">
       
        <div className="flex justify-between items-start mb-8">
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-white">Escrow</h1>
            <p className="mt-2 text-gray-300">Secure SOL escrow transactions on Solana</p>
          </div>
          <TimeDisplay />
        </div>

       
        <MessageDisplay message={message} type={getMessageType()} onDismiss={() => setMessage('')} />

   
        <div className="bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Wallet Connection</h2>

          {!mounted ? (
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
                <p className="text-yellow-400 font-medium">Loading Wallet</p>
              </div>
              <p className="text-gray-300 text-sm">Initializing wallet connection...</p>
            </div>
          ) : !connected ? (
            // Wallet not connected state
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                <p className="text-red-400 font-medium">Wallet Not Connected</p>
              </div>
              <p className="text-gray-300">Connect a wallet to create, find, fund, and complete escrows.</p>
              <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !text-white !font-medium !px-6 !py-2 !rounded-lg !transition-colors" />
            </div>
          ) : (
           
            <div className="space-y-6">
              {/* Connection Status Card */}
              <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  {/* Green indicator showing connected status */}
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  <p className="text-green-400 font-medium">Wallet Connected</p>
                </div>
                {/* Disconnect button */}
                <WalletDisconnectButton className="!bg-red-600 hover:!bg-red-700 !text-white !font-medium !px-4 !py-2 !rounded-lg !transition-colors" />
              </div>

              {/* Balance Display Section */}
              <div className="border-t border-gray-600 pt-4">
                <BalanceDisplay />
              </div>
            </div>
          )}
        </div>

       
        {connected && <CreateEscrowForm />}
        {connected && <EscrowFinder />}
      </div>
    </div>
  )
}


export default function Home() {
  return (
    <EscrowProvider>
      <HomeContent />
    </EscrowProvider>
  )
}
