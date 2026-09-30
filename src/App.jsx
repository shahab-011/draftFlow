import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCircle2, Clock3, Copy, Cpu, FileText, GitBranch, House, Info, Layers3, LoaderCircle, MessageSquareText, MessagesSquare, RotateCcw, Search, Sparkles, WandSparkles, XCircle } from 'lucide-react'

const suggestions = ['The future of AI agents in everyday work', 'Why small teams can out-innovate big companies', 'Building in public: what I learned this year', 'How to make feedback actually useful']
const API = import.meta.env.VITE_API_URL || ''
const pageFromPath = () => ({ '/': 'home', '/chat': 'chat', '/about': 'about' })[window.location.pathname] || 'home'

export default function App() {
  const [page, setPage] = useState(pageFromPath)
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempts, setAttempts] = useState([])
  const [activeStep, setActiveStep] = useState('idle')
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const workflowRef = useRef(null)
  const resultRef = useRef(null)
  const latest = attempts.at(-1)
  const done = !busy && attempts.length > 0
  const wordCount = useMemo(() => latest?.draft?.trim() ? latest.draft.trim().split(/\s+/).length : 0, [latest])

  function navigate(next) {
    const path = next === 'home' ? '/' : `/${next}`
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const onPop = () => setPage(pageFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (page !== 'chat') return
    if (busy) workflowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else if (done) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else if (activeStep === 'error') workflowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [page, busy, done, activeStep])

  async function generate(value = topic) {
    if (busy || value.trim().length < 3) return
    setTopic(value); setPage('chat')
    if (window.location.pathname !== '/chat') window.history.pushState({}, '', '/chat')
    setError(''); setAttempts([]); setBusy(true); setActiveStep('writer')
    try {
      const response = await fetch(`${API}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: value.trim() }) })
      if (!response.ok || !response.body) throw new Error('Could not connect to the workflow API. Check the backend URL and try again.')
      const reader = response.body.getReader(), decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value: chunk, done: ended } = await reader.read()
        if (ended) break
        buffer += decoder.decode(chunk, { stream: true })
        const events = buffer.split('\n\n'); buffer = events.pop() || ''
        for (const block of events) {
          const type = block.match(/^event: (.+)$/m)?.[1], raw = block.match(/^data: (.+)$/m)?.[1]
          if (!type || !raw) continue
          const data = JSON.parse(raw)
          if (type === 'start') { setMaxAttempts(data.max_attempts || 3); setActiveStep('writer') }
          if (type === 'writing') {
            setActiveStep('writer')
            setAttempts(prev => prev.some(a => a.attempt === data.attempt) ? prev.map(a => a.attempt === data.attempt ? { ...a, events: [...a.events, 'Writer is composing a draft'] } : a) : [...prev, { attempt: data.attempt, draft: '', feedback: '', approved: false, events: ['Writer is composing a draft'] }])
          }
          if (type === 'search') {
            setActiveStep('search')
            setAttempts(prev => data.status === 'searching'
              ? (prev.some(a => a.attempt === data.attempt) ? prev.map(a => a.attempt === data.attempt ? { ...a, events: [...a.events, 'Tavily is searching the web'] } : a) : [...prev, { attempt: data.attempt, draft: '', feedback: '', approved: false, events: ['Tavily is searching the web'] }])
              : prev.map(a => a.attempt === data.attempt ? { ...a, events: [...a.events, 'Search results returned to writer'] } : a))
          }
          if (type === 'draft') {
            setActiveStep('reviewer')
            setAttempts(prev => [...prev.filter(a => a.attempt !== data.attempt), { ...(prev.find(a => a.attempt === data.attempt) || { attempt: data.attempt, feedback: '', approved: false }), draft: data.text, events: [...(prev.find(a => a.attempt === data.attempt)?.events || []), 'Draft created', 'Sent to reviewer'] }])
          }
          if (type === 'review') {
            setAttempts(prev => prev.map(a => a.attempt === data.attempt ? { ...a, approved: data.approved, feedback: data.feedback, events: [...a.events, data.approved ? 'Approved for publishing' : 'Feedback sent to writer'] } : a))
            setActiveStep(data.approved ? 'complete' : 'writer')
          }
          if (type === 'complete') setActiveStep('complete')
          if (type === 'error') throw new Error(data.message || 'The workflow encountered an error.')
        }
      }
    } catch (e) { setError(e.message || 'Something went wrong.'); setActiveStep('error') }
    finally { setBusy(false) }
  }

  async function copyPost() {
    if (!latest?.draft) return
    try { await navigator.clipboard.writeText(latest.draft); setCopied(true); setTimeout(() => setCopied(false), 1600) }
    catch { setError('Clipboard access is unavailable in this browser.') }
  }

  const status = busy ? 'WORKFLOW RUNNING' : latest?.approved ? 'READY TO PUBLISH' : done ? 'REVIEW COMPLETE' : 'YOUR AI WRITING WORKSPACE'
  return <><div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar"><button className="brand" onClick={() => navigate('home')} aria-label="Draftflow home"><span className="brand-mark"><WandSparkles size={19}/></span><span>draftflow<span className="brand-period">.</span></span></button><nav className="nav-shell" aria-label="Main navigation"><span className={`nav-indicator nav-indicator-${page}`} aria-hidden="true"/><button className={page === 'home' ? 'nav-active' : ''} onClick={() => navigate('home')} aria-current={page === 'home' ? 'page' : undefined}><House size={15}/><span>Home</span></button><button className={page === 'chat' ? 'nav-active' : ''} onClick={() => navigate('chat')} aria-current={page === 'chat' ? 'page' : undefined}><MessagesSquare size={15}/><span>Chat</span></button><button className={page === 'about' ? 'nav-active' : ''} onClick={() => navigate('about')} aria-current={page === 'about' ? 'page' : undefined}><Info size={15}/><span>About</span></button></nav></header>
    <main id="top">
      {page === 'home' && <Home onGenerate={generate} onNavigate={navigate}/>}
      {page === 'chat' && <Chat topic={topic} setTopic={setTopic} generate={generate} busy={busy} attempts={attempts} latest={latest} activeStep={activeStep} maxAttempts={maxAttempts} done={done} error={error} status={status} wordCount={wordCount} copied={copied} copyPost={copyPost} workflowRef={workflowRef} resultRef={resultRef}/>}
      {page === 'about' && <About/>}
      <footer><button className="brand footer-brand" onClick={() => navigate('home')}><span className="brand-mark"><WandSparkles size={15}/></span><span>draftflow<span className="brand-period">.</span></span></button><span>A small study in thoughtful automation.</span><button onClick={() => navigate('chat')}>Try the studio <ArrowUpRight size={12}/></button></footer>
    </main>
  </>
}

function Home({ onGenerate, onNavigate }) {
  const [idea, setIdea] = useState('')
  return <div className="page home-page"><section className="home-hero"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line"/> YOUR AI WRITING WORKSPACE</div><h1>Good ideas deserve<br/><span className="gradient-text">better first drafts.</span></h1><p className="hero-description">A little research. A thoughtful first draft. An honest review.<br className="desktop-only"/> Your next LinkedIn post, refined until it’s ready.</p><div className="hero-tags"><span><Search size={14}/> Live web research</span><span><RotateCcw size={14}/> Iterative refinement</span><span><CheckCircle2 size={14}/> Quality reviewed</span></div></div><HeroArt/></section>
    <section className="home-prompt panel"><div className="step-label"><span className="step-number">01</span> START WITH AN IDEA</div><h2>What should we write about?</h2><p>Give your agent a topic. It’ll take it from here.</p><form onSubmit={e => { e.preventDefault(); onGenerate(idea) }}><label className="sr-only" htmlFor="home-topic">Post topic</label><textarea id="home-topic" value={idea} onChange={e => setIdea(e.target.value)} placeholder="e.g. What remote teams can learn from async-first startups…" maxLength={500}/><div className="input-footer"><span>{idea.length}/500</span><button className="generate-btn" disabled={idea.trim().length < 3}>Start writing <ArrowRight size={16}/></button></div></form><div className="suggestions"><span className="suggest-label"><Sparkles size={13}/> NEED A SPARK?</span><div className="suggestion-list">{suggestions.map(s => <button key={s} onClick={() => onGenerate(s)} className="suggestion">{s}<ArrowUpRight size={12}/></button>)}</div></div></section>
    <section className="home-features"><Feature icon={<Search size={17}/>} title="Research that’s current" text="The writer can call Tavily when the topic needs fresh context."/><Feature icon={<RotateCcw size={17}/>} title="A real feedback loop" text="A separate reviewer checks the draft and sends specific feedback."/><Feature icon={<Layers3 size={17}/>} title="Every attempt, visible" text="Follow each draft, review, and revision as it happens."/></section><button className="text-link" onClick={() => onNavigate('about')}>Explore how the project works <ArrowRight size={14}/></button>
  </div>
}

function Chat({ topic, setTopic, generate, busy, attempts, latest, activeStep, maxAttempts, done, error, status, wordCount, copied, copyPost, workflowRef, resultRef }) {
  return <div className="page chat-page"><div className="page-heading"><div className="eyebrow"><span className="eyebrow-line"/> {status}</div><h1>Let’s make your next post <span className="gradient-text">count.</span></h1><p>Share a topic, then watch the writer and reviewer work through it.</p></div><section className="chat-input panel"><div className="step-label"><span className="step-number">01</span> YOUR TOPIC</div><form onSubmit={e => { e.preventDefault(); generate(topic) }}><label className="sr-only" htmlFor="chat-topic">Post topic</label><textarea id="chat-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="What would you like to write about?" maxLength={500}/><div className="input-footer"><span>{topic.length}/500</span><button className="generate-btn" disabled={busy || topic.trim().length < 3}>{busy ? <><LoaderCircle className="spin" size={16}/> Working on it</> : <>Generate post <ArrowRight size={16}/></>}</button></div></form></section>
    <section className="chat-workflow-grid" ref={workflowRef}><Workflow activeStep={activeStep} busy={busy} maxAttempts={maxAttempts}/><Result latest={latest} attempts={attempts} busy={busy} done={done} error={error} wordCount={wordCount} copied={copied} copyPost={copyPost} resultRef={resultRef} maxAttempts={maxAttempts}/></section>
    {attempts.length > 0 && <section className="timeline-section"><div className="timeline-heading"><div className="step-label"><span className="step-number">↻</span> ITERATION HISTORY</div><span>{attempts.length} {attempts.length === 1 ? 'draft' : 'drafts'} so far</span></div><div className="attempt-list">{attempts.map((a, i) => <article className={`attempt-card ${i === attempts.length - 1 ? 'attempt-current' : ''}`} key={a.attempt}><div className="attempt-card-top"><span className="attempt-index">0{a.attempt}</span><strong>Draft {a.attempt}</strong><span className={`verdict ${a.approved ? 'approved' : a.feedback ? 'revising' : 'pending'}`}>{a.approved ? 'APPROVED' : a.feedback ? 'NEEDS REVISION' : busy && i === attempts.length - 1 ? 'IN PROGRESS' : 'REVIEWED'}</span></div><p className="attempt-preview">{a.draft || 'Writer is preparing this draft…'}</p><div className="attempt-events">{a.events.map((event, n) => <span key={n}><Check size={11}/>{event}</span>)}</div>{a.feedback && <div className="timeline-feedback"><span>REVIEWER</span>{a.feedback}</div>}</article>)}</div></section>}
  </div>
}

function Workflow({ activeStep, busy, maxAttempts }) {
  return <section className="panel progress-panel"><div className="progress-top"><div><div className="step-label"><span className="step-number">02</span> THE LIVE WORKFLOW</div><h2>Thinking it through<span className="title-period">.</span></h2></div><span className={`run-pill ${busy ? 'run-active' : ''}`}><span className="run-dot"/>{busy ? 'LIVE' : activeStep === 'complete' ? 'FINISHED' : activeStep === 'error' ? 'ERROR' : 'STANDING BY'}</span></div><div className="workflow-track"><TrackRow icon={<WandSparkles size={16}/>} name="Writer" tag="CREATIVE · 0.7" text="Drafting a clear, human-sounding post" step="writer" active={activeStep} busy={busy}/><TrackLink active={activeStep === 'search'}/><TrackRow icon={<Search size={16}/>} name="Tavily search" tag="WEB TOOL" text="Finding fresh facts and useful context" step="search" active={activeStep} busy={busy}/><TrackLink active={activeStep === 'reviewer'}/><TrackRow icon={<CheckCircle2 size={16}/>} name="Reviewer" tag="JUDGMENT · 0.0" text="Checking clarity, structure, and publish-readiness" step="reviewer" active={activeStep} busy={busy}/></div><div className="loop-note"><RotateCcw size={13}/><span>Needs a polish? Feedback loops back to the writer.</span><span className="loop-limit">UP TO {maxAttempts} ATTEMPTS</span></div></section>
}

function TrackRow({ icon, name, tag, text, step, active, busy }) {
  const completed = active === 'complete' || (step === 'writer' && ['search','reviewer'].includes(active)) || (step === 'search' && active === 'reviewer') || (step === 'reviewer' && active === 'complete')
  return <div className="track-row"><div className={`track-icon ${completed ? 'track-done' : busy && active === step ? 'track-current' : ''}`}>{icon}</div><div className="track-copy"><div className="track-title">{name} <span className={`model-tag ${step === 'search' ? 'tool-tag' : step === 'reviewer' ? 'judge-tag' : ''}`}>{tag}</span></div><p>{text}</p></div>{busy && active === step ? <span className="state-working"><LoaderCircle size={13} className="spin"/> Working</span> : completed ? <span className="state-complete"><Check size={13}/></span> : <span className="state-waiting">Waiting</span>}</div>
}
function TrackLink({ active }) { return <div className="track-connector"><span className={active ? 'connector-flow' : ''}/></div> }

function Result({ latest, attempts, busy, done, error, wordCount, copied, copyPost, resultRef, maxAttempts }) {
  return <section className="panel result-panel" ref={resultRef}><div className="result-header"><div><div className="step-label"><span className="step-number">03</span> YOUR POST, IN PROGRESS</div><h2>{latest ? `Draft ${latest.attempt}` : 'Your draft will land here'}</h2></div>{latest?.draft && <button className="copy-btn" onClick={copyPost}>{copied ? <><Check size={14}/> Copied</> : <><Copy size={14}/> Copy post</>}</button>}</div><div className={`result-body ${latest?.draft ? '' : 'empty-result'}`}>{latest?.draft ? <><div className="post-meta"><span className="linkedin-badge">in</span><div><strong>Your LinkedIn post</strong><small>Draft {latest.attempt} · {wordCount} words</small></div><span className={`verdict ${latest.approved ? 'approved' : latest.feedback ? 'revising' : 'pending'}`}>{latest.approved ? <><CheckCircle2 size={13}/> APPROVED</> : latest.feedback ? <><RotateCcw size={13}/> REVISION</> : <><Clock3 size={13}/> REVIEWING</>}</span></div><div className="post-text">{latest.draft}</div>{latest.feedback && <div className={`feedback-box ${latest.approved ? 'feedback-approved' : ''}`}><div className="feedback-heading">{latest.approved ? <CheckCircle2 size={14}/> : <MessageSquareText size={14}/>} REVIEWER FEEDBACK</div><p>{latest.feedback}</p></div>}</> : <div className="empty-state"><div className="empty-icon"><FileText size={23}/><span><Sparkles size={12}/></span></div><strong>{busy ? 'Your agent is getting started…' : error ? 'The workflow ran into an issue.' : 'A great post starts with a topic.'}</strong><p>{error || (busy ? 'The writer, search tool, and reviewer are working through your idea.' : 'Enter a topic above to see each draft and reviewer note appear here.')}</p></div>}</div><div className="attempt-footer"><span><Layers3 size={14}/>{attempts.length ? `${attempts.length} of ${maxAttempts} attempts` : 'Attempts appear as your post evolves'}</span><div className="attempt-dots">{Array.from({ length: maxAttempts }, (_, i) => i + 1).map(n => <i key={n} className={n <= attempts.length ? 'dot-used' : ''}/>)}</div>{done && <span className={`final-outcome ${latest?.approved ? '' : 'not-approved'}`}>{latest?.approved ? 'Publish-ready' : 'Max attempts reached'}</span>}</div>
  </section>
}

function About() {
  return <div className="page about-page"><section className="about-intro"><div className="step-label"><span className="step-number">✳</span> THE PROJECT</div><h1>A writing workflow<br/>that <span className="gradient-text">knows when to rethink.</span></h1><p>One connected graph. Two purposeful feedback loops. A human-ready result at the end.</p></section><div className="about-content"><section className="about-card graph-card"><div className="about-card-head"><div><span className="mini-eyebrow">THE GRAPH</span><h3>A cycle with a point of view.</h3></div><span className="graph-mark"><GitBranch size={18}/></span></div><div className="graph-diagram"><div className="graph-node graph-start"><span className="graph-node-icon"><WandSparkles size={15}/></span><div><strong>Writer</strong><small>creative · 0.7</small></div></div><div className="graph-line"><span className="line-label">tool call?</span><ArrowDown size={13}/></div><div className="graph-branch"><div className="graph-node graph-tool"><span className="graph-node-icon"><Search size={14}/></span><div><strong>Tavily search</strong><small>fresh context</small></div></div><div className="branch-back"><span>search results</span><ArrowUpRight size={13}/></div></div><div className="graph-node graph-review"><span className="graph-node-icon"><CheckCircle2 size={15}/></span><div><strong>Reviewer</strong><small>judgment · 0.0</small></div></div><div className="review-branch"><span className="approved-label"><Check size={11}/> Approved · END</span><div className="review-loop"><RotateCcw size={12}/><span>Needs edits → writer · max 3 attempts</span></div></div></div><div className="graph-caption"><span><i className="legend-purple"/> Tool-use cycle</span><span><i className="legend-mint"/> Quality-refinement cycle</span></div></section><section className="about-card learn-card"><div className="about-card-head"><div><span className="mini-eyebrow">WHAT THIS PROJECT TEACHES</span><h3>From a prompt to a real agent.</h3></div><span className="learn-mark"><Cpu size={18}/></span></div><div className="learning-list"><Learning icon={<GitBranch size={15}/>} title="Cycles are first-class" text="Conditional edges send work backwards: tools return to the writer, feedback starts a new draft."/><Learning icon={<Search size={15}/>} title="Tools, chosen at runtime" text="The model decides when current facts are needed and calls Tavily through LangGraph’s ToolNode."/><Learning icon={<MessageSquareText size={15}/>} title="Specialists work better together" text="A creative writer explores possibilities; a zero-temperature reviewer applies consistent standards."/><Learning icon={<RotateCcw size={15}/>} title="Loops need guardrails" text="Approval ends refinement early. A max-attempt limit and recursion_limit keep runs bounded."/></div></section></div><div className="concept-strip"><span><Sparkles size={14}/> LANGGRAPH CONCEPTS IN PRACTICE</span><div>{['StateGraph','Conditional edges','ToolNode','ReAct tool use','Recursion limits','Temperature control'].map(x => <span key={x}>{x}</span>)}</div></div></div>
}

function HeroArt() { return <div className="hero-art" aria-hidden="true"><div className="orbit orbit-outer"/><div className="orbit orbit-inner"/><div className="art-node node-search"><Search size={17}/></div><div className="art-node node-write"><WandSparkles size={19}/></div><div className="art-node node-check"><Check size={17}/></div><div className="art-core"><span className="core-spark"><Sparkles size={24}/></span><div className="core-line"/><div className="core-line short"/><div className="core-line"/></div><div className="floating-chip chip-top"><span className="live-dot"/> Agent active</div><div className="floating-chip chip-bottom"><span className="chip-check"><Check size={11}/></span> Quality loop</div></div> }
function Feature({ icon, title, text }) { return <article className="feature-card"><span>{icon}</span><strong>{title}</strong><p>{text}</p></article> }
function Learning({ icon, title, text }) { return <div className="learning-item"><span className="learning-icon">{icon}</span><div><strong>{title}</strong><p>{text}</p></div></div> }
