import { ArrowRight, Check, Download, Globe2, LockKeyhole, MessageCircle, Phone, Sparkles, UsersRound, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Brand } from '../components/Brand';
import { setLanguage } from '../lib/i18n';
import { demoFriends } from '../lib/demo-data';
import { useAuthStore } from '../stores/auth.store';

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const enterDemo = useAuthStore((state) => state.enterDemo);
  const preview = () => { enterDemo(); navigate('/app/chats'); };
  return (
    <div className="landing-page">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="landing-nav">
        <Brand />
        <nav><a href="#signal">Signal</a><a href="#privacy">Privacy</a><a href="#calling">Calling</a></nav>
        <div className="landing-actions">
          <button className="lang-toggle" onClick={() => void setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}><Globe2 size={17} /> {i18n.language === 'ar' ? 'EN' : 'العربية'}</button>
          <Link to="/login" className="button button-ghost">Sign in</Link>
          <Link to="/register" className="button button-primary">Get NOVA <ArrowRight size={17} /></Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-badge"><Sparkles size={14} />{t('landing.badge')}</div>
            <h1>{t('landing.titleA')}<br /><span>{t('landing.titleB')}</span></h1>
            <p>{t('landing.body')}</p>
            <div className="hero-actions"><Link to="/register" className="button button-primary button-lg">{t('landing.primary')} <ArrowRight size={19} /></Link><button className="button button-ghost button-lg" onClick={preview}><span className="play-dot">▶</span>{t('landing.secondary')}</button></div>
            <div className="hero-proof"><div className="proof-avatars">{demoFriends.slice(0, 4).map((friend) => <Avatar key={friend.id} user={friend} size="sm" />)}</div><div><span>Trusted by close circles everywhere</span><small><Check size={13} /> No ads. No noise. Just your people.</small></div></div>
          </div>

          <div className="hero-product" aria-label="NOVA Connect product preview">
            <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" />
            <div className="floating-chip chip-lock"><LockKeyhole size={16} /><span>Private room<strong>End-to-end ready</strong></span></div>
            <div className="floating-chip chip-live"><i /> 4 friends live</div>
            <div className="product-window glass-panel">
              <div className="window-bar"><Brand compact /><div className="window-search">⌘ K &nbsp; Search your orbit</div><Avatar user={{ ...demoFriends[0]!, username: 'Noor' }} size="sm" /></div>
              <div className="window-body">
                <aside><span className="active"><MessageCircle /></span><span><UsersRound /></span><span><Phone /></span><span><Video /></span></aside>
                <div className="conversation-list"><p>MESSAGES <b>12</b></p>{demoFriends.slice(0, 4).map((friend, index) => <div className={index === 0 ? 'selected' : ''} key={friend.id}><Avatar user={friend} size="sm" showStatus /><span><strong>{friend.username}</strong><small>{friend.lastMessage}</small></span><time>{index ? `${index + 1}h` : 'now'}</time></div>)}</div>
                <div className="preview-chat"><header><Avatar user={demoFriends[0]!} size="sm" showStatus /><span><strong>Lina</strong><small>Online · In your orbit</small></span><button><Phone /></button><button><Video /></button></header><div className="preview-messages"><div className="msg-them">Are we still chasing the sunset tonight?<time>7:42 PM</time></div><div className="msg-me">Absolutely. I found a rooftop with the best view.<time>7:43 PM ··</time></div><div className="photo-card"><div className="fake-sky"><i /><b /></div><span>That rooftop looks unreal ✨</span></div></div><div className="preview-compose"><span>+</span><p>Write a message…</p><b>⌁</b><button>➤</button></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="signal-strip" id="signal"><span>{t('landing.trusted')}</span><div><strong>2.4M+</strong><small>{t('landing.messages')}</small></div><div><strong>99.99%</strong><small>{t('landing.calls')}</small></div><div><strong>∞</strong><small>{t('landing.friends')}</small></div></section>

        <section className="feature-section" id="calling"><div className="section-intro"><span>BUILT FOR CLOSENESS</span><h2>Everything you need.<br />Nothing you don’t.</h2><p>Thoughtful communication tools without the crowded feeds, public metrics, or algorithmic noise.</p></div><div className="feature-grid"><article><div className="feature-icon"><MessageCircle /></div><h3>Conversations that flow</h3><p>Instant delivery, live typing, seen states, and presence that never gets in the way.</p><div className="mini-bubbles"><i>Tonight at 8?</i><b>Wouldn’t miss it ✨</b></div></article><article><div className="feature-icon mint"><Video /></div><h3>Calls that feel close</h3><p>Peer-to-peer voice and video, plus private rooms for up to eight friends.</p><div className="mini-call"><span>04:32</span><div>{demoFriends.slice(0, 3).map((friend) => <Avatar key={friend.id} user={friend} size="md" />)}</div></div></article><article id="privacy"><div className="feature-icon pink"><LockKeyhole /></div><h3>Privacy is the foundation</h3><p>Secure sessions, private data boundaries, and an architecture ready for E2E encryption.</p><div className="privacy-seal"><LockKeyhole /><span>Private by design<small>Your moments stay yours</small></span></div></article></div></section>

        <section className="cta-section"><div><Sparkles /><h2>Your people are<br />one orbit away.</h2><p>Start a quieter, closer way to stay connected.</p><Link className="button button-primary button-lg" to="/register">Create your NOVA <ArrowRight /></Link><span><Download size={14} /> Installable on any device</span></div></section>
      </main>
      <footer><Brand /><span>© 2026 NOVA Connect. Private by design.</span><div><a href="#privacy">Privacy</a><a href="#">Terms</a><a href="#">Status</a></div></footer>
    </div>
  );
}
