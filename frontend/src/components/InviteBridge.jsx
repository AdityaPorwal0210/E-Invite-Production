import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

export default function InviteBridge() {
  const { id } = useParams();

  useEffect(() => {
    if (!id) return;

    // 1. The Mobile App Target
    const appScheme = `hostapp://invitation/${id}`;

    // 2. The Fallback Web URL (Your existing PublicInvite component)
    const fallbackUrl = `/share/${id}`;

    // 3. Attempt to violently pull the mobile app open
    window.location.href = appScheme;

    // 4. The Safety Net
    // If the browser is still here after 2.5 seconds, the app isn't installed.
    // Route them to the web view.
    const timer = setTimeout(() => {
      window.location.href = fallbackUrl;
    }, 2500);

    // Cleanup timer to prevent memory leaks
    return () => clearTimeout(timer);
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Opening your invitation...</h2>
      <p className="text-gray-600 mb-8 max-w-sm">
        You should be redirected automatically. If nothing happens, choose an option below:
      </p>
      
      <a 
        href={`hostapp://invitation/${id}`} 
        className="bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold mb-4 w-full max-w-xs hover:bg-emerald-600 transition"
      >
        Open in Mobile App
      </a> 
      
      <a 
        href={`/share/${id}`} 
        className="text-gray-500 underline p-3"
      >
        Continue in Browser
      </a>
    </div>
  );
}