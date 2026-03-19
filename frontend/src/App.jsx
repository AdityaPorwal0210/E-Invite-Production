import { useContext } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthContext } from './context/AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import CreateEventForm from './components/CreateEventForm';
import Groups from './components/Groups';
import GroupDetails from './components/GroupDetails';
import PublicInvite from './components/PublicInvite';
import PublicGroupJoin from './components/PublicGroupJoin';
import GroupInviteLanding from './components/GroupInviteLanding';
import Inbox from './components/Inbox';
import InvitationDetail from './components/InvitationDetail';
import SavedEvents from './components/SavedEvents';
import Profile from './components/Profile';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import HostGuestList from './components/HostGuestList';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Smart Group Join Route - redirects logged-in users to group details
const GroupJoinHandler = () => {
  const { id } = useParams();
  const { user, loading } = useContext(AuthContext);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }
  
  // If user is logged in, redirect to group details
  if (user) {
    return <Navigate to={`/group/${id}`} replace />;
  }
  
  // If not logged in, show the public join page
  return <PublicGroupJoin />;
};

function App() {
  return (
    <>
      <Toaster position="bottom-right" reverseOrder={false} />
      <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/share/:id" element={<PublicInvite />} />
      <Route path="/groups/join/:id" element={<GroupJoinHandler />} />
      <Route path="/group/invite/:id" element={<GroupInviteLanding />} />
      
      {/* Protected Routes */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/create-event" 
        element={
          <ProtectedRoute>
            <CreateEventForm />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/inbox" 
        element={
          <ProtectedRoute>
            <Inbox />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/saved" 
        element={
          <ProtectedRoute>
            <SavedEvents />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/invitation/:id" 
        element={
          <ProtectedRoute>
            <InvitationDetail />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/invitation/:id/guests" 
        element={
          <ProtectedRoute>
            <HostGuestList />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/groups" 
        element={
          <ProtectedRoute>
            <Groups />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/group/:id" 
        element={
          <ProtectedRoute>
            <GroupDetails />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } 
      />
    </Routes>
    </>
  );
}

export default App;
