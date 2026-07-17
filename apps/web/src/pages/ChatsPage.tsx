import { Edit3, Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { ChatPanel } from '../features/chat/ChatPanel';
import { useNovaStore } from '../stores/nova.store';

export function ChatsPage() {
  const { t } = useTranslation();
  const { userId } = useParams();
  const friends = useNovaStore((state) => state.friends);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const active = friends.find((friend) => friend.id === userId);
  const filtered = friends.filter((friend) => (
    friend.username.toLowerCase().includes(query.toLowerCase())
    && (filter === 'all' || Boolean(friend.unread))
  ));

  return (
    <div className="chats-layout">
      <aside className={`conversation-pane ${active ? 'mobile-hidden' : ''}`}>
        <div className="pane-title">
          <div><span>NOVA / INBOX</span><h1>{t('chats.title')}</h1><p>{t('chats.subtitle')}</p></div>
          <button aria-label={t('chats.newChat')} onClick={() => document.getElementById('conversation-search')?.focus()}><Edit3 /></button>
        </div>
        <label className="search-box"><Search /><input id="conversation-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('chats.search')} /></label>
        <div className="conversation-tabs">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{friends.length}</span></button>
          <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>Unread <span>{friends.reduce((count, friend) => count + (friend.unread ? 1 : 0), 0)}</span></button>
        </div>
        <div className="conversation-scroll">
          {filtered.map((friend) => (
            <Link className={friend.id === userId ? 'active' : ''} to={`/app/chats/${friend.id}`} key={friend.id}>
              <Avatar user={friend} size="md" showStatus />
              <span><strong>{friend.username}</strong><small>{friend.lastMessage ?? 'Start a conversation'}</small></span>
              <time>{friend.lastMessageAt ? new Date(friend.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}{friend.unread ? <b>{friend.unread}</b> : null}</time>
            </Link>
          ))}
        </div>
        <div className="inbox-note"><Sparkles /><span><strong>Your quiet inbox</strong><small>No ads, suggested posts, or public noise.</small></span></div>
      </aside>
      <div className={`chat-stage ${active ? 'mobile-active' : ''}`}>
        {active ? <ChatPanel friend={active} /> : <div className="empty-chat"><div className="empty-orbit"><span><Sparkles /></span><i /><i /></div><h2>{t('chats.empty')}</h2><p>{t('chats.emptyBody')}</p><span className="secure-note">◈ Private by design</span></div>}
      </div>
    </div>
  );
}
