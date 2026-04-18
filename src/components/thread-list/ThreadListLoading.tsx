export const ThreadListLoading = () => (
  <div className="thread-list-loading" aria-label="Loading threads">
    {Array.from({ length: 5 }, (_, index) => (
      <div className="thread-loading-row" key={index}>
        <span className="thread-loading-avatar" />
        <span className="thread-loading-copy" />
      </div>
    ))}
  </div>
);
