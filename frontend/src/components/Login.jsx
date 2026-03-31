import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import toast from 'react-hot-toast';
import api from '../utils/api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // OTP verification state (for unverified users)
  const [step, setStep] = useState(1); // 1 = login, 2 = verify OTP
  const [otp, setOtp] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [verifying, setVerifying] = useState(false);
  
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/';

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const response = await api.post('/users/google-login', {
        idToken: credentialResponse.credential
      });
      login(response.data.token, response.data.user);
      toast.success(' back!');
      navigate(returnTo);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Google login failed');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/users/login', {
        email,
        password
      });
      
      // Login successful
      login(response.data.token, response.data.user);
      toast.success('USB Bridge Active!');
      navigate(returnTo);
    } catch (err) {
      const message = err.response?.data?.message;
      const requiresOTP = err.response?.data?.requiresOTP;
      const emailFromResponse = err.response?.data?.email;
      
      if (requiresOTP && emailFromResponse) {
        // User needs to verify email first
        setUserEmail(emailFromResponse);
        setStep(2);
        setError(message || 'Please verify your email');
      } else {
        toast.error(message || 'Login failed');
        setError(message || 'Login failed');
      }
    }
    
    setLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setVerifying(true);

    try {
      const response = await api.post('/users/verify-otp', {
        email: userEmail,
        otp
      });
      
      // Login successful after verification
      login(response.data.token, response.data.user);
      navigate(returnTo);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP');
    }
    
    setVerifying(false);
  };

  // Step 2: OTP Verification for unverified users trying to login
  if (step === 2) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Verify Your Email
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Please verify your email to login. <br />
              We've sent a 6-digit code to <span className="font-medium">{userEmail}</span>
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleVerifyOTP}>
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">
                Enter OTP Code
              </label>
              <input
                id="otp"
                name="otp"
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm text-center text-2xl tracking-widest"
                placeholder="000000"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={verifying || otp.length !== 6}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {verifying ? 'Verifying...' : 'Verify OTP'}
              </button>
            </div>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setOtp('');
                  setError('');
                }}
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                ← Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Step 1: Login Form
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          {returnTo !== '/' && (
            <div className="mt-2 p-3 bg-blue-50 text-blue-700 text-sm rounded-md">
              Please log in or register to view this invitation.
            </div>
          )}
          <p className="mt-2 text-center text-sm text-gray-600">
            Or <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
              create a new account
            </Link>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          
          <div className="rounded-md shadow-sm -space-y-px">
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your email"
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your password"
              />
            </div>
            
            <div className="flex items-center justify-end mb-4">
              <Link 
                to="/forgot-password" 
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                Forgot Password?
              </Link>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">Or continue with</span>
            </div>
          </div>

          <div className="mt-2">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => {
                toast.error('Google login failed');
              }}
              useOneTap
            />
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
