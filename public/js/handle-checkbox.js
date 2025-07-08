function handleCheckbox(tableId) {
  // Evento: "Selecionar Todos da Tabela"
  $("#select-all").on("click", function () {
    const isChecked = this.checked;

    $(".row-checkbox").each(function () {
      // Marca/desmarca o checkbox da linha cliente
      this.checked = isChecked;

      const tr = $(this).closest("tr");
      const clientId = tr.data("client-id");
      const products = JSON.parse(tr.attr("data-products"));

      // Inicializa o Set se não existir
      if (!checkedProductsByClient[clientId]) {
        checkedProductsByClient[clientId] = new Set();
      }

      // Atualiza o estado dos produtos
      if (isChecked) {
        // Adiciona todos os produtos ao Set
        products.forEach((p) => {
          const productId =
            p.product?.id || p.product?._id || p.productId?.$oid;
          if (productId) {
            checkedProductsByClient[clientId].add(productId);
          }
        });
      } else {
        // Limpa o Set para este cliente
        checkedProductsByClient[clientId].clear();
      }

      // Se a linha estiver expandida, atualiza os checkboxes dos produtos
      const expandedRow = tr.next("tr");
      if (expandedRow.hasClass("shown")) {
        expandedRow.find(".product-checkbox").each(function () {
          const productId = $(this).data("product-id");
          this.checked = isChecked;

          // Garante que o estado está sincronizado
          if (isChecked) {
            checkedProductsByClient[clientId].add(productId);
          } else {
            checkedProductsByClient[clientId].delete(productId);
            console.log("deleta productId", productId, checkedProductsByClient);
          }
        });
      }
    });

    // Atualiza o estado do checkbox select-all
    $("#select-all").prop("checked", isChecked);
  });
}
