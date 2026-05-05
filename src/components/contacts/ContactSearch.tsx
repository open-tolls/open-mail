type ContactSearchProps = {
  query: string;
  onChange: (value: string) => void;
};

export const ContactSearch = ({ query, onChange }: ContactSearchProps) => (
  <label className="preferences-field">
    <span>Search contacts</span>
    <input
      aria-label="Search contacts"
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search by name or email"
      value={query}
    />
  </label>
);
