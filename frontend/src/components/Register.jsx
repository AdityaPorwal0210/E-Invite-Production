import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import toast from 'react-hot-toast';
import api from '../utils/api';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(''); // NEW STATE
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // OTP verification state
  const [step, setStep] = useState(1); // 1 = register, 2 = verify OTP
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
      toast.success('Welcome! Your account has been created with Google.');
      navigate(returnTo);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Google registration failed');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log("Attempting registration for:", email);
      const response = await api.post('/users/register', {
        name,
        email,
        password,
        phoneNumber // ADDED TO PAYLOAD
      });
      
      console.log("Registration Response:", response.data);

      if (response.data.requiresOTP) {
        // OTP sent, move to step 2
        toast.success('OTP sent! Check your email.');
        setUserEmail(response.data.email);
        setStep(2);
      } else {
        // Fallback - should not happen with OTP flow
        setError('Unexpected response from server');
      }
    } catch (err) {
      console.error("Registration Error:", err);
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Registration failed';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setVerifying(true);

    try {
      console.log("Verifying OTP for:", userEmail);
      const response = await api.post('/users/verify-otp', {
        email: userEmail,
        otp
      });
      
      console.log("OTP Verification Response:", response.data);

      // Now that they are verified in the DB, log them in with the token from verify-otp
      login(response.data.token, response.data.user);
      toast.success('Account verified! Welcome!');
      navigate(returnTo);
    } catch (err) {
      console.error("OTP Error:", err);
      toast.error(err.response?.data?.message || 'Invalid or expired OTP');
      setError(err.response?.data?.message || 'Invalid or expired OTP');
    } finally {
      setVerifying(false);
    }
  };

  // Step 2: OTP Verification
  if (step === 2) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Verify Your Email
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
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
                ← Back to Registration
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Step 1: Registration Form
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create a new account
          </h2>
          {returnTo !== '/' && (
            <div className="mt-2 p-3 bg-blue-50 text-blue-700 text-sm rounded-md">
              Please register to view this invitation.
            </div>
          )}
          <p className="mt-2 text-center text-sm text-gray-600">
            Already have an account? <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign in
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
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your full name"
              />
            </div>
            
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

            {/* THE NEW PHONE NUMBER FIELD */}
            <div className="mb-4">
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your phone number"
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter the number you received an SMS invite on to link your RSVPs.
              </p>
            </div>
            
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Create a password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Register'}
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
                toast.error('Google registration failed');
              }}
              useOneTap
            />
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;