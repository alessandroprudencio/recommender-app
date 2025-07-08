function initDataTable(
  selector,
  ajaxUrl,
  columns,
  options = {},
  usePagination = false,
  searchPlaceholder
) {
  // Primeiro inicializa o DataTable com as configurações básicas
  const table = $(selector).DataTable({
    serverSide: usePagination,
    processing: usePagination,
    ajax: usePagination ? ajaxUrl : null,
    columns: columns,
    lengthChange: usePagination,
    language: {
      searchPlaceholder: searchPlaceholder || "Pesquisar...",
    },
    ...options,
  });

  // Depois carrega o arquivo de tradução e atualiza o DataTable
  fetch("/public/js/datatable-pt-BR.json")
    .then((response) => response.json())
    .then((data) => {
      table.settings()[0].oLanguage = {
        ...table.settings()[0].oLanguage,
        ...data,
        searchPlaceholder: searchPlaceholder || "Pesquisar...",
      };
      table.draw();
    })
    .catch((error) => {
      console.error("Erro ao carregar JSON:", error);
    });

  // Inicializa tooltips quando a tabela é redesenhada
  $(selector).on("draw.dt", function () {
    const tooltipTriggerList = document.querySelectorAll(
      '[data-bs-toggle="tooltip"]'
    );
    tooltipTriggerList.forEach((el) => new bootstrap.Tooltip(el));
  });
}
