"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type GlossaryItem = {
  id: string;
  term: string;
  definition: string;
  category: string;
  updatedAt: string;
};

export default function LexiconPage() {
  const { data: session } = useSession();
  const [terms, setTerms] = useState<GlossaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Add/Edit term modal state
  const [showAddForm, setShowAddForm] = useState(false);
  const [termDraft, setTermDraft] = useState("");
  const [defDraft, setDefDraft] = useState("");
  const [catDraft, setCatDraft] = useState("Instructor Code Words");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTeacher = (session?.user as any)?.role === "TEACHER";

  useEffect(() => {
    loadTerms();
  }, []);

  async function loadTerms() {
    try {
      const res = await fetch("/api/lexicon");
      if (res.ok) {
        const d = await res.json();
        setTerms(d.terms || []);
      }
    } catch (err) {
      console.error("Load lexicon error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitTerm(e: React.FormEvent) {
    e.preventDefault();
    if (!termDraft.trim() || !defDraft.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/lexicon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: termDraft.trim(),
          definition: defDraft.trim(),
          category: catDraft,
        }),
      });

      if (res.ok) {
        setTermDraft("");
        setDefDraft("");
        setShowAddForm(false);
        loadTerms();
      } else {
        alert("Failed to save term.");
      }
    } catch (err: any) {
      alert(err.message || "Error saving term");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteTerm(id: string, term: string) {
    if (!confirm(`Delete "${term}" from the lexicon?`)) return;

    const res = await fetch(`/api/lexicon/${id}`, { method: "DELETE" });
    if (res.ok) {
      loadTerms();
    }
  }

  const categories = ["ALL", ...Array.from(new Set(terms.map((t) => t.category)))];

  const filteredTerms = terms.filter((t) => {
    const matchesCat = selectedCategory === "ALL" || t.category === selectedCategory;
    const matchesQuery =
      searchQuery === "" ||
      t.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.definition.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.25rem" }}>
      {/* Top Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: 4, fontSize: "0.85rem" }}>
            <Link href="/dashboard" style={{ color: "var(--color-text-muted)" }}>
              ← Dashboard
            </Link>
            <span style={{ color: "var(--color-border)" }}>/</span>
            <span style={{ fontWeight: 600 }}>Lexicon & Code Words</span>
          </div>
          <h1 style={{ margin: "0 0 4px" }}>📖 Teacher Code-Word Dictionary & Lexicon</h1>
          <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.95rem" }}>
            Instructor-specific terminology, code words (e.g. <em>&quot;Shaheed&quot;</em> for Narcissist), Punjabi musical terms & cross-lecture concepts.
          </p>
        </div>

        {isTeacher && (
          <button className="primary" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? "Cancel" : "➕ Add New Code-Word / Term"}
          </button>
        )}
      </div>

      {/* Add / Edit Form */}
      {showAddForm && (
        <form onSubmit={handleSubmitTerm} className="card" style={{ display: "grid", gap: "1rem", marginBottom: "2rem", border: "2px solid #000" }}>
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Add Code-Word or Domain Term</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }} className="grid-2col">
            <label>
              <strong>Term / Code-Word *</strong>
              <input
                value={termDraft}
                onChange={(e) => setTermDraft(e.target.value)}
                placeholder="e.g. Shaheed, Sur, Raag Bhairav, Administrative Discretion"
                required
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            <label>
              <strong>Category</strong>
              <select
                value={catDraft}
                onChange={(e) => setCatDraft(e.target.value)}
                style={{ width: "100%", marginTop: 4 }}
              >
                <option value="Instructor Code Words">Instructor Code Words (e.g. Shaheed)</option>
                <option value="Psychology">Psychology & Behavioral Dynamics</option>
                <option value="Music Theory">Music & Punjabi Discourse</option>
                <option value="Home & Domestic Dynamics">Home & Family Problems</option>
                <option value="CSS & Governance">CSS & Governance</option>
                <option value="Religion & Tasawwuf">Religion & Tasawwuf</option>
                <option value="Philosophy">Philosophy & History</option>
                <option value="Business & Strategy">Business & Leadership</option>
              </select>
            </label>
          </div>

          <label>
            <strong>Teacher&apos;s Meaning & Context *</strong>
            <textarea
              value={defDraft}
              onChange={(e) => setDefDraft(e.target.value)}
              placeholder="Explain how the instructor defines and uses this term in lectures..."
              rows={3}
              required
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="primary sm" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save to Lexicon"}
            </button>
            <button type="button" className="sm" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search & Category Filter Bar */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Search code words or definitions..."
          style={{ flex: "1 1 250px", padding: "0.55rem 0.85rem", fontSize: "0.95rem" }}
        />

        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`sm ${selectedCategory === cat ? "primary" : ""}`}
              onClick={() => setSelectedCategory(cat)}
              style={{ fontSize: "0.8rem" }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Lexicon Grid */}
      {loading ? (
        <p>Loading dictionary...</p>
      ) : filteredTerms.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--color-text-muted)" }}>
          No terms found matching your query.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {filteredTerms.map((item) => (
            <div key={item.id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                  <h3 style={{ margin: 0, fontSize: "1.25rem", color: "var(--color-text)" }}>
                    {item.term}
                  </h3>
                  <span className="badge tag-source" style={{ fontSize: "0.72rem" }}>
                    {item.category}
                  </span>
                </div>
                <p style={{ fontSize: "0.93rem", lineHeight: "1.55", margin: "0.5rem 0 1rem", color: "var(--color-text)" }}>
                  {item.definition}
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--color-border)", paddingTop: "0.6rem" }}>
                <Link href={`/search?q=${encodeURIComponent(item.term)}`} style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  🔍 Find in Lectures →
                </Link>

                {isTeacher && (
                  <button
                    className="sm danger"
                    onClick={() => handleDeleteTerm(item.id, item.term)}
                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
