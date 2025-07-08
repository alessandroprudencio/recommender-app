const checkedProductsByClient = {};

function handleDetailsControl(
  tableId,
  keyForAttr,
  title,
  pageLength,
  ajaxUrl,
  columns,
  createdRow,
  searchPlaceholder
) {
  getTranslation(
    tableId,
    keyForAttr,
    title,
    pageLength,
    ajaxUrl,
    columns,
    createdRow,
    searchPlaceholder
  );
}

function format(products, keyForAttr, title, clientId) {
  const colorMap = {
    branco: "#FFFFFF",
    preto: "#000000",
    vermelho: "#FF0000",
    azul: "#0000FF",
    verde: "#008000",
    amarelo: "#FFFF00",
    rosa: "#FFC0CB",
    roxo: "#800080",
    cinza: "#808080",
    bege: "#F5F5DC",
    marrom: "#8B4513",
    laranja: "#FFA500",
    lilas: "#C8A2C8",
    vinho: "#800000",
    dourado: "#FFD700",
    prateado: "#C0C0C0",
  };

  let html = `
        <h6 class="font-weight-bold text-primary mb-2">${title}:</h6>
        <ul class="list-group list-group-flush">
    `;

  // const rowClientCheckboxIsChecked = $(`tr[data-client-id="${clientId}"]`).find(
  //   'input[type="checkbox"]'
  // )[0].checked;

  const checkedSet = checkedProductsByClient[clientId] || new Set();

  products.forEach((p) => {
    const name = p[keyForAttr].productName || "";
    const size = p[keyForAttr].size || "—";
    const color = p[keyForAttr].productColor || "—";
    const category = p[keyForAttr].category || "—";
    const quantity = p.quantity || 0;

    const colorDot = `
      <span class="d-inline-block me-1 rounded-circle" style="
          width: 12px; height: 12px;
          background-color: ${colorMap[color.toLowerCase()]};
          border: 1px solid #ccc;
          vertical-align: middle;
      "></span>`;

    const productId = p[keyForAttr].id || p.productId?.$oid || "Sem ID";

    const checked = checkedSet.has(productId) ? "checked" : "";

    html += `
<li class="list-group-item">
  <div class="d-flex justify-content-between align-items-center">
    <div class="form-check mr-2">
        <input class="form-check-input product-checkbox" type="checkbox" data-product-id="${productId}" ${checked}>
    </div>
    <div class="flex-grow-1 ms-2">
      <strong>${name}</strong>
      <div class="text-muted small mt-1">
        🧵 <strong>${size}</strong> &nbsp;|&nbsp; 
        🎨 ${colorDot} <span class="text-capitalize">${color}</span> &nbsp;|&nbsp; 
        🗂️ <span class="text-capitalize">${category}</span>
      </div>
    </div>
    <span class="badge bg-primary text-white rounded-pill">Qtd: ${quantity}</span>
  </div>
</li>
`;
  });

  html += "</ul>";
  return html;
}

async function getTranslation(
  tableId,
  keyForAttr,
  title,
  pageLength,
  ajaxUrl,
  columns,
  createdRow,
  searchPlaceholder
) {
  fetch("/public/js/datatable-pt-BR.json")
    .then((response) => response.json())
    .then((data) => {
      $(document).ready(function () {
        const table = $(tableId).DataTable({
          language: {
            ...data,
            searchPlaceholder,
          },
          init: function () {
            // Espera a linguagem carregar e altera o placeholder
            $("div.dataTables_wrapper div.dataTables_filter input").attr(
              "placeholder",
              "Digite para buscar teste..."
            );
          },
          searchPlaceholder: "Enter Last Name",
          processing: true, // mostra "processando" durante a busca
          serverSide: true,
          searching: true, // Ativa o filtro de pesquisa
          ajax: ajaxUrl,
          pageLength,
          lengthChange: false,
          columns,
          createdRow,
        });

        $(`${tableId}_filter input`).attr("placeholder", searchPlaceholder);

        // Checkbox sincronizado
        $(`${tableId} tbody`).on("change", ".row-checkbox", function () {
          const tr = $(this).closest("tr");
          const clientId = tr.data("client-id");
          const isChecked = this.checked;
          const products = JSON.parse(tr.attr("data-products"));

          if (!checkedProductsByClient[clientId]) {
            checkedProductsByClient[clientId] = new Set();
          }

          products.forEach((p) => {
            const productId = p[keyForAttr].id || p.productId?.$oid;
            if (productId) {
              isChecked
                ? checkedProductsByClient[clientId].add(productId)
                : checkedProductsByClient[clientId].delete(productId);
            }
          });

          const expandedRow = tr.next("tr");
          if (expandedRow.hasClass("shown")) {
            expandedRow.find(".product-checkbox").prop("checked", isChecked);
          }
        });

        // Expansão
        $(`${tableId} tbody`).on("click", "td.details-control", function () {
          const tr = $(this).closest("tr");
          const row = table.row(tr);

          if (row.child.isShown()) {
            row.child.hide();
            tr.removeClass("shown");
            $(this).html(`<i class="fas fa-chevron-down"></i>`);
          } else {
            const clientId = tr.data("client-id");
            const products = JSON.parse(tr.attr("data-products"));
            row.child(format(products, keyForAttr, title, clientId)).show();
            tr.addClass("shown");
            $(this).html(`<i class="fa fa-chevron-up text-primary"></i>`);
          }
        });

        $(tableId).on("draw.dt", function () {
          const tooltipTriggerList = document.querySelectorAll(
            '[data-bs-toggle="tooltip"]'
          );
          tooltipTriggerList.forEach((el) => new bootstrap.Tooltip(el));
        });
      });
    })
    .catch((error) => {
      console.error("Erro ao carregar JSON:", error);
    });
}
