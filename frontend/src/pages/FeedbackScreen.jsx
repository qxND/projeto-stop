import { useEffect, useState } from 'react';
import { useUserData } from '../hooks/useUserData';
import api from '../lib/api';
import MatrixRain from '../components/MatrixRain';
import { Navigate } from 'react-router-dom';

function FeedbackScreen() {
  const { user, loading: userLoading } = useUserData();
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (userLoading) {
      return; // Wait until user data is loaded
    }
    
    if (!user || user.role !== 'admin') {
      setLoading(false);
      return; // Don't fetch if not an admin
    }

    const fetchFeedbacks = async () => {
      try {
        const { data } = await api.get('/feedback');
        setFeedbacks(data);
      } catch (err) {
        console.error('Failed to fetch feedbacks:', err);
        setError('Could not load feedbacks. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchFeedbacks();
  }, [user, userLoading]);

  if (userLoading || loading) {
    return (
      <div className="relative flex items-center justify-center h-screen text-white font-cyber">
        <MatrixRain className="absolute inset-0 z-0" />
        <div className="absolute inset-0 bg-black/70 z-0"></div>
        <p className="z-10 text-2xl text-cyan-400">Loading...</p>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    // You can either redirect or show an access denied message
    // return <Navigate to="/" replace />;
    return (
        <div className="relative flex items-center justify-center h-screen text-white font-cyber">
            <MatrixRain className="absolute inset-0 z-0" />
            <div className="absolute inset-0 bg-black/70 z-0"></div>
            <div className="z-10 text-center p-8 border-2 border-red-500 bg-black/50" data-augmented-ui="tl-clip tr-clip br-clip bl-clip border">
                <h1 className="text-4xl text-red-500 font-bold mb-4">Access Denied</h1>
                <p className="text-lg">You do not have permission to view this page.</p>
            </div>
        </div>
    );
  }

  return (
    <div className="relative min-h-screen text-white font-cyber bg-black">
      <MatrixRain className="absolute inset-0 z-0" />
      <div className="absolute inset-0 bg-black/80 z-0"></div>
      
      <div className="relative z-10 p-4 sm:p-6 lg:p-8">
        <h1 className="text-4xl font-bold text-cyan-300 uppercase tracking-widest mb-8 text-center">Feedback Console</h1>
        
        {error && <p className="text-red-500 text-center mb-4">{error}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse" data-augmented-ui="tl-clip-x tr-clip-x br-clip-x bl-clip-x border">
            <thead>
              <tr className="border-b-2 border-cyan-500">
                <th className="p-3 text-left text-cyan-400 uppercase">Date</th>
                <th className="p-3 text-left text-cyan-400 uppercase">User</th>
                <th className="p-3 text-left text-cyan-400 uppercase">Type</th>
                <th className="p-3 text-left text-cyan-400 uppercase">Message</th>
              </tr>
            </thead>
            <tbody>
              {feedbacks.length > 0 ? (
                feedbacks.map((fb) => (
                  <tr key={fb.feedback_id} className="border-b border-cyan-800/50 hover:bg-cyan-900/20 transition-colors">
                    <td className="p-3 align-top whitespace-nowrap">{new Date(fb.created_at).toLocaleString()}</td>
                    <td className="p-3 align-top whitespace-nowrap">{fb.nome_jogador || 'Anonymous'}</td>
                    <td className="p-3 align-top">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                        fb.feedback_type === 'bug_report' ? 'bg-red-500 text-white' :
                        fb.feedback_type === 'compliment' ? 'bg-green-500 text-white' :
                        'bg-yellow-500 text-black'
                      }`}>
                        {fb.feedback_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 align-top max-w-lg">{fb.feedback_message}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-gray-400">
                    No feedback entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default FeedbackScreen;
