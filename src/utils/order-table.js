export function orderTable(req, columnsMap, defaultOrderby) {
  const orderColumnIndex = Number(req.query["order[0][column]"]) || 0;
  const orderDir = req.query["order[0][dir]"] || "asc";

  // console.log("orderColumnIndex", orderColumnIndex);
  // console.log("orderDir", orderDir);

  let orderBy = {};
  if (columnsMap[orderColumnIndex]) {
    let relation = columnsMap[orderColumnIndex];

    if (relation.includes(".")) {
      let [relation, field] = columnsMap[orderColumnIndex].split(".");
      // console.log(relation);
      // console.log(field);

      orderBy[relation] = { [field]: orderDir };
    } else {
      // console.log("relation", relation);
      // console.log("orderDir", orderDir);
      orderBy[relation] = orderDir;
    }
  } else {
    // ordem padrão
    orderBy = { createdAt: "desc" };
  }

  return orderBy;
}
