import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Web3ConnectButton from './web3/Web3ConnectButton';
import { useWallet, useSigner, useDisconnect } from '@thirdweb-dev/react';
import { generateSIWEMessage, verifySIWESignatureAndGetJWT } from '../lib/auth-handoff';

const { FiLock, FiEye, FiEyeOff, FiShield, FiMail, FiActivity } = FiIcons;

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login, loginWithCustomToken, loading } = useAuth();

  const wallet = useWallet();
  const signer = useSigner();
  const disconnect = useDisconnect();
  const [isSigningInWithWeb3, setIsSigningInWithWeb3] = useState(false);

  // Use useEffect to listen to wallet connection changes
  React.useEffect(() => {
    const handleWeb3Login = async () => {
      if (wallet && signer && !isSigningInWithWeb3) {
        setIsSigningInWithWeb3(true);
        setError('');

        try {
          const address = await signer.getAddress();
          const chainId = await signer.getChainId();
          const domain = window.location.host;
          const uri = window.location.origin;
          const version = '1';
          const statement = 'Sign in with Ethereum to the AXiM Core application.';
          const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          const issuedAt = new Date().toISOString();

          const message = generateSIWEMessage(domain, address, statement, uri, version, chainId, nonce, issuedAt);
          const signature = await signer.signMessage(message);

          const { token } = await verifySIWESignatureAndGetJWT(message, signature, address);
          if (token && loginWithCustomToken) {
              await loginWithCustomToken(token);
          } else {
             // Fallback login logic handling for testing environments where verifySIWESignatureAndGetJWT works but no loginWithCustomToken
             console.log("Got token from SIWE:", token);
          }

        } catch (err) {
          console.error("SIWE Handshake failed:", err);
          setError("Web3 Signature request was denied or failed. Please use standard login. " + (err ? "" : ""));
          // Disconnect wallet if signature fails so user can try again or use standard login
          await disconnect();
        } finally {
          setIsSigningInWithWeb3(false);
        }
      }
    };
    handleWeb3Login();
  }, [wallet, signer, loginWithCustomToken, isSigningInWithWeb3, disconnect]);

  // Mock values for diagnostic panel
  const validatedTokens = 42;
  const totalRequests = 45;
  const efficiency = ((validatedTokens / totalRequests) * 100).toFixed(1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await login(email, password);
    } catch (err) {
      console.error('[Login] Login failed:', err);
      setError(err.message || 'An unexpected error occurred during login.');
    }
  };

  return (
    <div className="min-h-screen bg-onyx-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Neon-saturated grid backdrop */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/10 via-purple-900/10 to-onyx-950 pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass-effect rounded-2xl p-8 shadow-2xl border border-onyx-accent/30 relative overflow-hidden">
          {/* Subtle cyber-onyx border glow */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>

          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-onyx-800 to-onyx-900 border border-onyx-accent/50 shadow-[0_0_15px_rgba(59,130,246,0.3)] rounded-full mb-4"
            >
              <SafeIcon icon={FiShield} className="text-2xl text-blue-400" />
            </motion.div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">AXiM Core</h1>
            <p className="text-slate-400 text-sm tracking-wide">Internal Systems - Authorized Personnel Only</p>
          </div>

          <AnimatePresence mode="wait">
            {(!wallet || error) ? (
              <motion.form
                key="email-form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                <div className="flex flex-col items-center justify-center mb-4">
                  <Web3ConnectButton />
                  <div className="mt-4 flex items-center w-full">
                    <div className="flex-grow border-t border-onyx-accent/30"></div>
                    <span className="mx-4 text-slate-500 text-xs font-mono uppercase">OR</span>
                    <div className="flex-grow border-t border-onyx-accent/30"></div>
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <SafeIcon icon={FiMail} className="text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-onyx-900/50 border border-onyx-accent/30 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-slate-500 transition-all outline-none"
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="password" className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <SafeIcon icon={FiLock} className="text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-3 bg-onyx-900/50 border border-onyx-accent/30 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-slate-500 transition-all outline-none"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-blue-400 transition-colors"
                    >
                      <SafeIcon icon={showPassword ? FiEyeOff : FiEye} />
                    </button>
                  </div>
                </div>

                <div className="h-12 flex items-center">
                  {error ? (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="w-full text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-lg p-3"
                    >
                      {error}
                    </motion.div>
                  ) : null}
                </div>

                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 rounded-lg font-medium hover:from-blue-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-onyx-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/80 mr-2"></div>
                      Authenticating...
                    </>
                  ) : (
                    'Access Dashboard'
                  )}
                </motion.button>
              </motion.form>
            ) : (
              <motion.div
                key="web3-signing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-8 space-y-4"
              >
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400"></div>
                <p className="text-slate-300 font-mono text-sm tracking-wide">Awaiting Signature Request...</p>
                <p className="text-slate-500 text-xs text-center">Please check your wallet extension to sign the authentication message.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Diagnostic Panel */}
          <div className="mt-8 pt-6 border-t border-onyx-accent/20">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center space-x-2">
                <SafeIcon icon={FiActivity} className="text-emerald-500" />
                <span className="font-mono tracking-wide">Session Verification Efficiency:</span>
              </div>
              <span className="font-mono text-emerald-400 font-bold">{efficiency}%</span>
            </div>
            <div className="mt-2 w-full bg-onyx-900 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-1.5 rounded-full"
                style={{ width: `${efficiency}%` }}
              ></div>
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              <span>{validatedTokens} Validated</span>
              <span>{totalRequests} Total Requests</span>
            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );
};

export default Login;
