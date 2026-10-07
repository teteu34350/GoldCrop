(() => {
  const targetIds = ["farmLivestockCount", "farmMilkToday", "farmMilkAverage", "farmLivestockAlerts"];
  const format = (value) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Number(value || 0));
  fetch("/pecuaria/api/dashboard/", { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error(`Resumo da pecuária: HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      if (data.ok !== true) throw new Error(data.message || "Resposta inválida do resumo pecuário.");
      document.getElementById(targetIds[0]).textContent = format(data.resumo.total_animais);
      document.getElementById(targetIds[1]).textContent = format(data.resumo.producao_hoje);
      document.getElementById(targetIds[2]).textContent = format(data.resumo.media_litros_vaca_dia);
      document.getElementById(targetIds[3]).textContent = format(data.alertas.length);
    })
    .catch((error) => {
      console.error("Falha ao carregar resumo da pecuária:", error);
      const message = document.getElementById("farmLivestockError");
      if (message) message.hidden = false;
    });
})();
