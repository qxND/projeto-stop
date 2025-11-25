import { useState } from 'react';
import { Github, Linkedin } from 'lucide-react';
import MatrixRain from '../components/MatrixRain';
import api from '../lib/api';

// --- Data for Team Members ---
const teamMembers = [
  {
    name: 'Breno Cerioni (Líder)',
    role: 'Frontend',
    linkedin: 'https://www.linkedin.com/in/breno-cerioni-a5061324a/',
    github: 'https://github.com/BrenoSca170',
  },
  {
    name: 'Pedro Ferreira',
    role: 'Frontend',
    linkedin: 'https://www.linkedin.com/in/pedro-rodrigues-39481725a/',
  },
  {
    name: 'Eduardo Voga',
    role: 'Gerenciador do projeto',
    linkedin: 'https://www.linkedin.com/in/breno-ribeiro-gomes-953ba424b/',
    github: 'https://github.com/BrenoRibeiroGomes',
  },
  {
    name: 'Eneida Monaco',
    role: 'documentação',
    linkedin: 'https://www.linkedin.com/in/victor-hugo-batista-ribeiro-77993a26b/',
  },
  {
    name: 'Lucas F. Farias(Lider)',
    role: 'Backend',
    linkedin: 'https://www.linkedin.com/in/victor-hugo-batista-ribeiro-77993a26b/',
  },
  {
    name: 'Victor H. Batista',
    role: 'Backend',
    linkedin: 'https://www.linkedin.com/in/victor-hugo-batista-ribeiro-77993a26b/',
  },
  {
    name: 'Gabriel Morgado',
    role: 'Backend',
    linkedin: 'https://www.linkedin.com/in/victor-hugo-batista-ribeiro-77993a26b/',
  },
  {
    name: 'Guilherme Messina',
    role: 'Frontend',
    linkedin: 'https://www.linkedin.com/in/victor-hugo-batista-ribeiro-77993a26b/',
  },
  {
    name: 'João Pedro Tosta',
    role: 'Backend',
    linkedin: 'https://www.linkedin.com/in/victor-hugo-batista-ribeiro-77993a26b/',
  },{
    name: 'Luciano Fabricio',
    role: 'documentação',
    linkedin: 'https://www.linkedin.com/in/victor-hugo-batista-ribeiro-77993a26b/',
  },{
    name: 'Luccas Belleza',
    role: 'Backend',
    linkedin: 'https://www.linkedin.com/in/victor-hugo-batista-ribeiro-77993a26b/',
  },
  {
    name: 'Matheus M. Ikeda',
    role: 'Frontend',
    linkedin: 'https://www.linkedin.com/in/victor-hugo-batista-ribeiro-77993a26b/',
  },
  
];

const rolesOrder = ['Gerenciador do projeto', 'Backend', 'Frontend', 'documentação'];

// --- Participant Card Component ---
const ParticipantCard = ({ name, linkedin, github }) => (
  <div 
    className="p-4 bg-black/70 border border-cyan-700 flex justify-between items-center"
    data-augmented-ui="tl-clip br-clip border"
  >
    <p className="text-lg text-white">{name}</p>
    <div className="flex gap-4">
      <a href={linkedin} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-200 transition-colors">
        <Linkedin size={24} />
      </a>
      {github && (
        <a href={github} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-200 transition-colors">
          <Github size={24} />
        </a>
      )}
    </div>
  </div>
);

function AboutUsScreen() {
  const [feedbackType, setFeedbackType] = useState('improvement');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) {
      alert('A mensagem de feedback não pode estar vazia.');
      return;
    }
    setIsSubmitting(true);
    setSubmitStatus(null);
    try {
      await api.post('/feedback', {
        feedback_type: feedbackType,
        feedback_message: feedbackMessage,
      });
      setSubmitStatus('success');
      setFeedbackMessage('');
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitStatus(null), 5000);
    }
  };
  
  const groupedTeamMembers = teamMembers.reduce((acc, member) => {
    const { role } = member;
    if (!acc[role]) {
      acc[role] = [];
    }
    acc[role].push(member);
    return acc;
  }, {});

  return (
    <div className="relative flex flex-col items-center min-h-screen text-white font-cyber overflow-y-auto p-4 bg-black">
      <MatrixRain className="absolute inset-0 z-0" />
      <div className="absolute inset-0 bg-black/80 z-0"></div>

      <div className="relative z-10 w-full max-w-6xl mx-auto my-12 space-y-12">
        <h1 className="text-5xl font-bold text-cyan-300 uppercase tracking-widest text-center">Sobre Nós</h1>
        
        {/* --- Mission and Photo Section --- */}
        <div 
          className="p-6 border-2 border-cyan-400 bg-black/60"
          data-augmented-ui="tl-clip tr-clip br-clip bl-clip border"
        >
                    <div className="flex flex-col items-center justify-center">
                      <div
                        className="w-full h-80 border-2 border-cyan-500 flex items-center justify-center mx-auto overflow-hidden"
                        data-augmented-ui="tl-clip tr-clip br-clip bl-clip border"
                      >
                        <img src="/GRUPROTO.jpeg" alt="Foto do Grupo" className="w-full h-full object-cover" />
                      </div>
                    </div>        </div>
        
        {/* --- Team Section --- */}
        <div 
          className="p-6 border-2 border-cyan-400 bg-black/60"
          data-augmented-ui="tl-clip tr-clip br-clip bl-clip border"
        >
          <h2 className="text-4xl font-bold text-cyan-400 mb-8 text-center">Nossa Equipe</h2>
          <div className="space-y-8">
            {rolesOrder.map(role => (
              groupedTeamMembers[role] && (
                <div key={role}>
                  <h3 
                    className="text-2xl font-semibold text-pink-400 tracking-wider mb-4 p-2 border-b-2 border-pink-500/50"
                  >
                    {role}
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {groupedTeamMembers[role].map(member => (
                      <ParticipantCard key={member.name} {...member} />
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>

        {/* --- Feedback Section --- */}
        <div 
          className="p-6 border-2 border-cyan-400 bg-black/60"
          data-augmented-ui="tl-clip tr-clip br-clip bl-clip border"
        >
          <h2 className="text-3xl font-bold text-cyan-400 mb-6 text-center">Envie-nos seu Feedback</h2>
          <form onSubmit={handleSubmit} className="w-full max-w-lg mx-auto">
            <div className="mb-4">
              <label htmlFor="feedbackType" className="block text-cyan-300 mb-2">Tipo de Feedback</label>
              <select
                id="feedbackType"
                value={feedbackType}
                onChange={(e) => setFeedbackType(e.target.value)}
                className="w-full p-3 bg-black/80 border border-cyan-500 text-white focus:outline-none focus:border-cyan-300"
                data-augmented-ui="br-clip"
              >
                <option value="improvement">Melhoria</option>
                <option value="bug_report">Relatório de Bug</option>
                <option value="compliment">Elogio</option>
              </select>
            </div>
            <div className="mb-4">
              <label htmlFor="feedbackMessage" className="block text-cyan-300 mb-2">Mensagem</label>
              <textarea
                id="feedbackMessage"
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
                rows="5"
                className="w-full p-3 bg-black/80 border border-cyan-500 text-white focus:outline-none focus:border-cyan-300"
                data-augmented-ui="br-clip"
                placeholder="Diga-nos o que você pensa..."
              ></textarea>
            </div>
            <div className="text-center">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-cyan-500 text-black font-bold py-3 px-8 hover:bg-cyan-400 transition-colors disabled:bg-gray-600"
                data-augmented-ui="tl-clip br-clip"
              >
                {isSubmitting ? 'Enviando...' : 'Enviar Feedback'}
              </button>
            </div>
            {submitStatus === 'success' && <p className="text-green-400 mt-4 text-center">Feedback enviado com sucesso! Obrigado.</p>}
            {submitStatus === 'error' && <p className="text-red-400 mt-4 text-center">Falha ao enviar feedback. Por favor, tente novamente mais tarde.</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

export default AboutUsScreen;
