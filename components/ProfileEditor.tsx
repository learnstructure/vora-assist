
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { storageService } from '../services/storageService';

interface ProfileEditorProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
}

const ProfileEditor: React.FC<ProfileEditorProps> = ({ profile, setProfile }) => {
  const [isEditing, setIsEditing] = useState(!profile.name);
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [tagInput, setTagInput] = useState('');
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = () => {
    const updated = { ...formData, lastUpdated: Date.now() };
    storageService.saveProfile(updated);
    setProfile(updated);
    setShowSaved(true);
    setIsEditing(false);
    setTimeout(() => setShowSaved(false), 3000);
  };

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      setFormData(prev => ({
        ...prev,
        technicalStack: [...new Set([...prev.technicalStack, tagInput.trim()])]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      technicalStack: prev.technicalStack.filter(t => t !== tag)
    }));
  };

  if (!isEditing && profile.name) {
    return (
      <div className="p-5 lg:p-10 max-w-4xl mx-auto h-full overflow-y-auto pb-32 flex flex-col animate-fade-in">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-[2rem] bg-zinc-900 border border-zinc-800 flex items-center justify-center text-3xl font-black text-blue-500 shadow-2xl">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl lg:text-5xl font-black text-white tracking-tighter uppercase">{profile.name}</h1>
              <p className="text-blue-500 text-sm font-black uppercase tracking-[0.3em] mt-1">{profile.role || 'Partner'}</p>
            </div>
          </div>
          <button
            onClick={() => setIsEditing(true)}
            className="px-5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-zinc-700 transition-all"
          >
            Edit Persona
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <section className="bg-zinc-900/40 border border-zinc-800/50 rounded-[2.5rem] p-8 lg:p-10">
            <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.25em] mb-6">Partner Context</h2>
            <p className="text-zinc-300 text-lg lg:text-xl font-medium leading-relaxed italic">
              "{profile.bio || "No background story provided yet. VORA is operating on general intelligence."}"
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="bg-zinc-900/40 border border-zinc-800/50 rounded-[2rem] p-8">
              <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.25em] mb-6">Expertise Stack</h2>
              <div className="flex flex-wrap gap-2.5">
                {profile.technicalStack.length > 0 ? profile.technicalStack.map(tag => (
                  <span key={tag} className="px-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-bold text-zinc-400">
                    {tag}
                  </span>
                )) : <span className="text-zinc-600 text-xs italic">No domains specified.</span>}
              </div>
            </section>

            <section className="bg-zinc-900/40 border border-zinc-800/50 rounded-[2rem] p-8">
              <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.25em] mb-6">System Meta</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500 font-medium">Memory Sync</span>
                  <span className="text-green-500 font-black text-[10px] uppercase">Active</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500 font-medium">Profile Integrity</span>
                  <span className="text-blue-500 font-black text-[10px] uppercase">Verified</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500 font-medium">Last Intelligence Sync</span>
                  <span className="text-zinc-400 font-black text-[10px] uppercase">{new Date(profile.lastUpdated).toLocaleDateString()}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-10 max-w-4xl mx-auto h-full overflow-y-auto pb-32 flex flex-col animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tighter mb-2 uppercase">Identity Setup</h1>
          <p className="text-zinc-500 text-sm font-medium">Configure VORA's understanding of your professional world.</p>
        </div>
        <div className="flex items-center gap-3">
          {profile.name && (
            <button
              onClick={() => setIsEditing(false)}
              className="text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest px-4"
            >
              Cancel
            </button>
          )}
          {showSaved && (
            <span className="text-green-500 text-xs font-black uppercase tracking-widest flex items-center gap-2 bg-green-500/10 px-4 py-2 rounded-xl border border-green-500/20">
              Synced
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6 lg:space-y-8">
        <section className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-6 lg:p-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Legal Name / Moniker</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Alex Rivera"
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all placeholder:text-zinc-700"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Professional Role</label>
              <input
                type="text"
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
                placeholder="AI Research Engineer"
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all placeholder:text-zinc-700"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Partner Context (Bio)</label>
            <textarea
              value={formData.bio}
              onChange={e => setFormData({ ...formData, bio: e.target.value })}
              placeholder="What specific details should VORA remember about your mission and background?"
              rows={4}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 resize-none transition-all leading-relaxed placeholder:text-zinc-700"
            />
          </div>
        </section>

        <section className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-6 lg:p-10 space-y-6">
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Domain Skills & Technical Stack</label>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2.5 min-h-[2rem]">
              {formData.technicalStack.map(tag => (
                <span key={tag} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-bold text-zinc-300">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="text-zinc-600 hover:text-red-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={addTag}
              placeholder="Type skill and press Enter..."
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-600/20 transition-all placeholder:text-zinc-700"
            />
          </div>
        </section>

        <button
          onClick={handleSave}
          disabled={!formData.name}
          className="w-full bg-white text-black hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed font-black py-5 rounded-3xl transition-all shadow-2xl active:scale-[0.98] uppercase tracking-[0.3em] text-[11px]"
        >
          Initialize Intelligence Profile
        </button>
      </div>
    </div>
  );
};

export default ProfileEditor;
