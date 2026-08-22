import { getPersona } from '@/utils/swarmPersonas';

/**
 * @param {{message: {personaId: string, content: string, createdAt?: number}}} props
 */
export default function SwarmMessageBubble({ message }) {
  const persona = getPersona(message.personaId) || {
    name: message.personaId || 'Swarm',
    shortName: 'AI',
    avatarColor: 'var(--text-muted)'
  };
  return (
    <article className="swarm-message">
      <div className="swarm-avatar" style={{ background: persona.avatarColor }}>
        {persona.shortName || persona.name?.slice(0, 2)}
      </div>
      <div className="swarm-message-main">
        <div className="swarm-message-meta">
          <strong>{persona.name}</strong>
          {message.createdAt ? <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> : null}
        </div>
        <p>{message.content || 'Working...'}</p>
      </div>
    </article>
  );
}
