import React, { useState, useEffect } from "react";
import { db, auth, googleProvider } from "./firebase";
import {
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";

const IMPORTANCE_WEIGHT = { high: 3, medium: 2, low: 1 };

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const [activeTab, setActiveTab] = useState("home"); // 'home' | 'groups' | 'create'
  const [groups, setGroups] = useState([]);
  const [polls, setPolls] = useState([]);

  // Group Form State
  const [newGroupName, setNewGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // Poll Form State
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [pollTitle, setPollTitle] = useState("");
  const [pollType, setPollType] = useState("native"); // 'native' | 'form'
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [formUrl, setFormUrl] = useState("");
  const [importance, setImportance] = useState("medium");
  const [deadline, setDeadline] = useState("");

  // Listen to persistent login state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Handle redirect result when user returns from Google
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      setAuthError(err.message);
    });
  }, []);

  // Listen to Groups and Polls in real-time
  useEffect(() => {
    if (!user) return;

    const unsubGroups = onSnapshot(collection(db, "groups"), (snap) => {
      const gList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setGroups(gList);
    });

    const unsubPolls = onSnapshot(collection(db, "polls"), (snap) => {
      const pList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPolls(pList);
    });

    return () => {
      unsubGroups();
      unsubPolls();
    };
  }, [user]);


  // Handle Google Sign-In via Redirect (Mobile-Friendly)
  const handleGoogleSignIn = async () => {
    setAuthError("");
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  // Create a new group
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await addDoc(collection(db, "groups"), {
      name: newGroupName.trim(),
      code,
      createdBy: user.uid,
      memberUids: [user.uid],
      members: [{ uid: user.uid, name: user.displayName || user.email }],
    });
    setNewGroupName("");
  };

  // Join existing group via code
  const handleJoinGroup = async (e) => {
    e.preventDefault();
    const target = groups.find(
      (g) => g.code.toUpperCase() === joinCode.trim().toUpperCase()
    );
    if (!target) {
      alert("No group found with that code.");
      return;
    }
    if (target.memberUids.includes(user.uid)) {
      alert("You are already in this group!");
      return;
    }
    await updateDoc(doc(db, "groups", target.id), {
      memberUids: arrayUnion(user.uid),
      members: arrayUnion({ uid: user.uid, name: user.displayName || user.email }),
    });
    setJoinCode("");
  };

  // Create a Poll
  const handleCreatePoll = async (e) => {
    e.preventDefault();
    const group = groups.find((g) => g.id === selectedGroupId);
    if (!group || !pollTitle.trim()) return;

    const cleanOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (pollType === "native" && cleanOptions.length < 2) {
      alert("Please add at least 2 options.");
      return;
    }

    await addDoc(collection(db, "polls"), {
      groupId: group.id,
      groupName: group.name,
      title: pollTitle.trim(),
      type: pollType,
      options: pollType === "native" ? cleanOptions : [],
      formUrl: pollType === "form" ? formUrl.trim() : "",
      importance,
      deadline: deadline || null,
      createdBy: user.uid,
      creatorName: user.displayName || user.email,
      createdAt: Date.now(),
      votes: [],
    });

    setPollTitle("");
    setPollOptions(["", ""]);
    setFormUrl("");
    setDeadline("");
    setActiveTab("home");
  };

  // Submit Vote or Mark Google Form Done
  const handleVote = async (poll, optionIndex) => {
    const existingVotes = poll.votes || [];
    const filtered = existingVotes.filter((v) => v.uid !== user.uid);
    const updatedVotes = [
      ...filtered,
      {
        uid: user.uid,
        name: user.displayName || user.email,
        optionIndex,
        timestamp: Date.now(),
      },
    ];
    await updateDoc(doc(db, "polls", poll.id), { votes: updatedVotes });
  };

  if (authLoading) {
    return <div className="app-container" style={{ padding: 40, textAlign: "center" }}>Loading...</div>;
  }

  // GOOGLE SIGN-IN SCREEN
  if (!user) {
    return (
      <div className="app-container" style={{ justifyContent: "center", padding: 24 }}>
        <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
          <h2 style={{ marginBottom: 8, color: "#1e3a8a" }}>Our Polls</h2>
          <p style={{ fontSize: "0.9rem", color: "#64748b", marginBottom: 24 }}>
            Sign in once with Google to join groups and vote on polls.
          </p>
          {authError && (
            <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 8, fontSize: "0.85rem", marginBottom: 16 }}>
              {authError}
            </div>
          )}
          <button className="btn btn-primary" onClick={handleGoogleSignIn}>
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  // Filter groups and polls for current user
  const myGroups = groups.filter((g) => g.memberUids?.includes(user.uid));
  const myGroupIds = myGroups.map((g) => g.id);

  // Sort polls by Importance (High -> Med -> Low) and then closest Deadline
  const myPolls = polls
    .filter((p) => myGroupIds.includes(p.groupId))
    .sort((a, b) => {
      const impDiff = (IMPORTANCE_WEIGHT[b.importance] || 1) - (IMPORTANCE_WEIGHT[a.importance] || 1);
      if (impDiff !== 0) return impDiff;
      if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return b.createdAt - a.createdAt;
    });

  const pendingPolls = myPolls.filter((p) => !p.votes?.some((v) => v.uid === user.uid));
  const completedPolls = myPolls.filter((p) => p.votes?.some((v) => v.uid === user.uid));

  const renderPollCard = (poll) => {
    const myVote = poll.votes?.find((v) => v.uid === user.uid);
    const isCreator = poll.createdBy === user.uid;
    const groupObj = groups.find((g) => g.id === poll.groupId);
    const allMembers = groupObj?.members || [];
    const answeredUids = (poll.votes || []).map((v) => v.uid);
    const missingMembers = allMembers.filter((m) => !answeredUids.includes(m.uid));

    return (
      <div className="card" key={poll.id}>
        <div className="meta-row">
          <span className="badge badge-group">{poll.groupName}</span>
          <span className={`badge badge-${poll.importance}`}>
            {poll.importance} Priority
          </span>
        </div>

        <h3 style={{ fontSize: "1.05rem", marginBottom: 4 }}>{poll.title}</h3>
        <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 12 }}>
          By {poll.creatorName}
          {poll.deadline && ` • Due: ${new Date(poll.deadline).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`}
        </div>

        {poll.type === "native" ? (
          <div>
            {poll.options.map((opt, idx) => {
              const selected = myVote?.optionIndex === idx;
              return (
                <button
                  key={idx}
                  className={`btn btn-outline ${selected ? "selected" : ""}`}
                  onClick={() => handleVote(poll, idx)}
                >
                  {selected ? "✓ " : ""}{opt}
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <a
              href={poll.formUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
              style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: 8 }}
            >
              Open Google Form ↗
            </a>
            <button
              className={`btn ${myVote ? "btn-secondary" : "btn-success"}`}
              onClick={() => handleVote(poll, 0)}
            >
              {myVote ? "✓ Marked as Answered" : "Mark as Answered ✓"}
            </button>
          </div>
        )}

        {/* Creator Analytics: Who answered & who voted what */}
        {isCreator && (
          <div className="results-box">
            <div style={{ fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
              Creator View ({poll.votes?.length || 0}/{allMembers.length} answered)
            </div>

            {poll.type === "native" ? (
              poll.options.map((opt, idx) => {
                const voters = (poll.votes || []).filter((v) => v.optionIndex === idx);
                return (
                  <div key={idx}>
                    <strong>{opt} ({voters.length}):</strong>
                    <div className="voter-names">
                      {voters.length > 0 ? voters.map((v) => v.name).join(", ") : "No votes yet"}
                    </div>
                  </div>
                );
              })
            ) : (
              <div>
                <strong>Completed Form:</strong>
                <div className="voter-names">
                  {(poll.votes || []).length > 0
                    ? poll.votes.map((v) => v.name).join(", ")
                    : "No one yet"}
                </div>
              </div>
            )}

            {missingMembers.length > 0 && (
              <div style={{ marginTop: 6, color: "#b91c1c", fontSize: "0.78rem" }}>
                <strong>Still waiting on:</strong> {missingMembers.map((m) => m.name).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Our Polls</h1>
        <div className="user-pill">
          <span>{user.displayName}</span>
          <button className="btn-logout" onClick={() => signOut(auth)}>
            Exit
          </button>
        </div>
      </header>

      <main className="content">
        {activeTab === "home" && (
          <div>
            <div className="section-title">To Fill ({pendingPolls.length})</div>
            {pendingPolls.length === 0 ? (
              <div className="card" style={{ color: "#64748b", textAlign: "center" }}>
                You are all caught up!
              </div>
            ) : (
              pendingPolls.map(renderPollCard)
            )}

            {completedPolls.length > 0 && (
              <>
                <div className="section-title">Completed ({completedPolls.length})</div>
                {completedPolls.map(renderPollCard)}
              </>
            )}
          </div>
        )}

        {activeTab === "groups" && (
          <div>
            <div className="card">
              <h3 style={{ marginBottom: 10 }}>Join a Group</h3>
              <form onSubmit={handleJoinGroup}>
                <input
                  className="input"
                  placeholder="Enter 6-character Invite Code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                />
                <button className="btn btn-primary" type="submit">
                  Join Group
                </button>
              </form>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 10 }}>Create New Group</h3>
              <form onSubmit={handleCreateGroup}>
                <input
                  className="input"
                  placeholder="Group Name (e.g. Tsevet, Padlers)"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
                <button className="btn btn-secondary" type="submit">
                  Create Group
                </button>
              </form>
            </div>

            <div className="section-title">My Groups ({myGroups.length})</div>
            {myGroups.map((g) => (
              <div className="card" key={g.id}>
                <div className="meta-row">
                  <strong>{g.name}</strong>
                  <span className="badge badge-group">Code: {g.code}</span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Members ({g.members?.length || 1}):{" "}
                  {g.members?.map((m) => m.name).join(", ")}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "create" && (
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Create a Poll</h3>
            {myGroups.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
                Create or join a group in the Groups tab first!
              </p>
            ) : (
              <form onSubmit={handleCreatePoll}>
                <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Select Group</label>
                <select
                  className="select"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Group --</option>
                  {myGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>

                <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Question / Title</label>
                <input
                  className="input"
                  placeholder="What are we voting on?"
                  value={pollTitle}
                  onChange={(e) => setPollTitle(e.target.value)}
                  required
                />

                <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Poll Type</label>
                <select
                  className="select"
                  value={pollType}
                  onChange={(e) => setPollType(e.target.value)}
                >
                  <option value="native">In-App Poll</option>
                  <option value="form">Google Forms Link</option>
                </select>

                {pollType === "native" ? (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Options</label>
                    {pollOptions.map((opt, idx) => (
                      <input
                        key={idx}
                        className="input"
                        placeholder={`Option ${idx + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const copy = [...pollOptions];
                          copy[idx] = e.target.value;
                          setPollOptions(copy);
                        }}
                      />
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setPollOptions([...pollOptions, ""])}
                    >
                      + Add Option
                    </button>
                  </div>
                ) : (
                  <>
                    <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Google Form URL</label>
                    <input
                      className="input"
                      type="url"
                      placeholder="https://docs.google.com/forms/..."
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      required
                    />
                  </>
                )}

                <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Importance</label>
                <select
                  className="select"
                  value={importance}
                  onChange={(e) => setImportance(e.target.value)}
                >
                  <option value="high">High (Shows at top)</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>

                <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Deadline (Optional)</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />

                <button className="btn btn-primary" type="submit">
                  Publish Poll
                </button>
              </form>
            )}
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === "home" ? "active" : ""}`}
          onClick={() => setActiveTab("home")}
        >
          <span>📋</span>
          <span>Polls</span>
        </button>
        <button
          className={`nav-item ${activeTab === "create" ? "active" : ""}`}
          onClick={() => setActiveTab("create")}
        >
          <span>➕</span>
          <span>New Poll</span>
        </button>
        <button
          className={`nav-item ${activeTab === "groups" ? "active" : ""}`}
          onClick={() => setActiveTab("groups")}
        >
          <span>👥</span>
          <span>Groups</span>
        </button>
      </nav>
    </div>
  );
}