type ThreadListEmptyProps = {
  activeFolderName: string | null;
  isSearchActive: boolean;
};

export const ThreadListEmpty = ({ activeFolderName, isSearchActive }: ThreadListEmptyProps) => (
  <div className="thread-empty-state">
    <p className="thread-empty-title">
      {isSearchActive ? 'No results found' : `${activeFolderName ?? 'Folder'} is clear`}
    </p>
    <p className="thread-empty-copy">
      {isSearchActive
        ? 'Tente outro termo para localizar conversas por assunto, snippet ou participante.'
        : 'Nenhuma thread encontrada nesta pasta no momento. Quando houver atividade, ela aparece aqui.'}
    </p>
  </div>
);
