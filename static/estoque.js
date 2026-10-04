document.addEventListener("DOMContentLoaded", () => {
    carregarEstoque();
    carregarMovimentacoes();
    
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            filtrarProdutos();
        });
    });

    document.getElementById("buscaProduto").addEventListener("input", filtrarProdutos);
    
    // Configurar datas padrões
    const hoje = new Date().toISOString().split("T")[0];
    document.getElementById("entData").value = hoje;
    document.getElementById("saiData").value = hoje;
});

let produtosGlobal = [];
let talhoesGlobal = [];

async function carregarEstoque() {
    try {
        const res = await fetch("/api/estoque/produtos/");
        const data = await res.json();
        if (data.ok) {
            produtosGlobal = data.produtos;
            atualizarKPIs();
            renderizarProdutos(produtosGlobal);
        } else {
            showToast(data.message || "Erro ao carregar produtos.", "error");
        }
    } catch (e) {
        showToast("Falha de conexão.", "error");
    }
}

async function carregarMovimentacoes() {
    try {
        const res = await fetch("/api/estoque/movimentacoes/");
        const data = await res.json();
        if (data.ok) {
            renderizarMovimentacoes(data.movimentacoes);
        }
    } catch (e) {
        console.error("Erro ao carregar movimentações", e);
    }
}

async function carregarTalhoes() {
    // Reutilizar o endpoint de talhões para o select de saída
    try {
        const res = await fetch("/api/state/");
        const data = await res.json();
        if (data.ok && data.talhoes) {
            talhoesGlobal = data.talhoes.filter(t => t.active !== false);
            const select = document.getElementById("saiTalhao");
            select.innerHTML = '<option value="">Selecione um talhão...</option>' + 
                talhoesGlobal.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
        }
    } catch (e) {
        console.error("Erro ao carregar talhões para estoque", e);
    }
}

function atualizarKPIs() {
    document.getElementById("kpiTotalProdutos").innerText = produtosGlobal.length;
    document.getElementById("kpiEstoqueBaixo").innerText = produtosGlobal.filter(p => p.status === "warning").length;
    document.getElementById("kpiSemEstoque").innerText = produtosGlobal.filter(p => p.status === "danger").length;
}

function renderizarProdutos(lista) {
    const container = document.getElementById("listaProdutos");
    if (lista.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--gray-500); background: white; border-radius: 12px; border: 1px solid var(--gray-200);">Nenhum produto encontrado.</div>`;
        return;
    }

    container.innerHTML = lista.map(p => {
        let statusLabel = "Normal";
        if (p.status === "danger") statusLabel = "Sem Estoque";
        else if (p.status === "warning") statusLabel = "Estoque Baixo";

        return `
        <div class="produto-card">
            <div class="produto-header">
                <div>
                    <div class="produto-nome">${p.nome}</div>
                    <div class="produto-categoria">${p.categoria}</div>
                </div>
                <span class="status-badge status-${p.status}">${statusLabel}</span>
            </div>
            
            <div class="produto-qtd">
                ${p.quantidade_atual.toLocaleString("pt-BR")} <span class="produto-unidade">${p.unidade}</span>
            </div>
            
            ${p.estoque_minimo > 0 ? `<div style="font-size:0.75rem; color:var(--gray-500);">Estoque Mínimo: ${p.estoque_minimo}</div>` : ""}
            
            <div class="produto-actions">
                <button class="btn-ghost" style="flex:1; padding:0.5rem; justify-content:center; color:var(--green-600)" onclick="abrirModalEntrada(${p.id}, '${p.nome}', '${p.unidade}')">+ Entrada</button>
                <button class="btn-ghost" style="flex:1; padding:0.5rem; justify-content:center; color:var(--red-600)" onclick="abrirModalSaida(${p.id}, '${p.nome}', '${p.unidade}', ${p.quantidade_atual})">- Saída</button>
            </div>
        </div>
        `;
    }).join("");
}

function filtrarProdutos() {
    const categoria = document.querySelector(".tab-btn.active").getAttribute("data-categoria");
    const busca = document.getElementById("buscaProduto").value.toLowerCase();
    
    let filtrados = produtosGlobal;
    if (categoria !== "Todos") {
        filtrados = filtrados.filter(p => p.categoria === categoria);
    }
    if (busca) {
        filtrados = filtrados.filter(p => p.nome.toLowerCase().includes(busca) || p.categoria.toLowerCase().includes(busca));
    }
    
    renderizarProdutos(filtrados);
}

function renderizarMovimentacoes(lista) {
    const tbody = document.getElementById("listaMovimentacoes");
    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--gray-500);">Nenhuma movimentação registrada.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(m => {
        const dataFormatada = new Date(m.data + "T12:00:00").toLocaleDateString("pt-BR");
        const isEntrada = m.tipo === "ENTRADA";
        const qtdStr = (isEntrada ? "+" : "-") + m.quantidade + " " + m.produto_unidade;
        const color = isEntrada ? "var(--green-600)" : "var(--red-600)";
        
        return `
        <tr style="border-bottom: 1px solid var(--gray-100);">
            <td style="padding: 1rem; color: var(--gray-600); font-size: 0.875rem;">${dataFormatada}</td>
            <td style="padding: 1rem; font-weight: 500; color: var(--gray-900); font-size: 0.875rem;">${m.produto_nome}</td>
            <td style="padding: 1rem;"><span class="status-badge" style="background:${isEntrada ? 'var(--green-50)' : 'var(--red-50)'}; color:${color};">${m.tipo}</span></td>
            <td style="padding: 1rem; text-align: right; font-weight: 600; color: ${color}; font-size: 0.875rem;">${qtdStr}</td>
            <td style="padding: 1rem; color: var(--gray-600); font-size: 0.875rem;">${m.motivo}</td>
            <td style="padding: 1rem; color: var(--gray-600); font-size: 0.875rem;">${m.talhao_nome || '-'}</td>
        </tr>
        `;
    }).join("");
}

function showToast(msg, type="success") {
    const toast = document.getElementById("toast");
    if (!toast) {
        alert(msg);
        return;
    }
    toast.innerText = msg;
    toast.style.background = type === "error" ? "var(--red-600)" : "var(--green-600)";
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
}

// ================= MODAIS ================= //

function abrirModalNovoProduto() {
    document.getElementById("formNovoProduto").reset();
    document.getElementById("modalNovoProduto").style.display = "flex";
}

function fecharModalNovoProduto() {
    document.getElementById("modalNovoProduto").style.display = "none";
}

async function salvarNovoProduto() {
    const nome = document.getElementById("npNome").value;
    const categoria = document.getElementById("npCategoria").value;
    const unidade = document.getElementById("npUnidade").value;
    
    if(!nome || !categoria || !unidade) {
        showToast("Preencha os campos obrigatórios.", "error");
        return;
    }

    const payload = {
        nome, categoria, unidade,
        estoque_inicial: document.getElementById("npInicial").value,
        estoque_minimo: document.getElementById("npMinimo").value,
        local_armazenamento: document.getElementById("npLocal").value
    };

    try {
        const res = await fetch("/api/estoque/produtos/", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
            showToast("Produto cadastrado com sucesso!");
            fecharModalNovoProduto();
            carregarEstoque();
            carregarMovimentacoes();
        } else {
            showToast(data.message, "error");
        }
    } catch(e) {
        showToast("Erro de rede.", "error");
    }
}

function abrirModalEntrada(id, nome, unidade) {
    document.getElementById("formEntrada").reset();
    document.getElementById("entProdutoId").value = id;
    document.getElementById("entProdutoNome").value = `${nome} (${unidade})`;
    document.getElementById("entData").value = new Date().toISOString().split("T")[0];
    document.getElementById("modalEntrada").style.display = "flex";
}

function fecharModalEntrada() {
    document.getElementById("modalEntrada").style.display = "none";
}

async function salvarEntrada() {
    const produto_id = document.getElementById("entProdutoId").value;
    const quantidade = document.getElementById("entQtd").value;
    const motivo = document.getElementById("entMotivo").value;
    const dataMov = document.getElementById("entData").value;
    
    if(!quantidade || quantidade <= 0) {
        showToast("Informe uma quantidade válida.", "error");
        return;
    }

    const payload = {
        produto_id,
        tipo: "ENTRADA",
        quantidade,
        motivo,
        data: dataMov,
        observacao: document.getElementById("entObs").value
    };

    try {
        const res = await fetch("/api/estoque/movimentacoes/", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
            showToast("Entrada registrada com sucesso!");
            fecharModalEntrada();
            carregarEstoque();
            carregarMovimentacoes();
        } else {
            showToast(data.message, "error");
        }
    } catch(e) {
        showToast("Erro de rede.", "error");
    }
}

function abrirModalSaida(id, nome, unidade, maxQtd) {
    document.getElementById("formSaida").reset();
    document.getElementById("saiProdutoId").value = id;
    document.getElementById("saiProdutoNome").value = `${nome} (${unidade})`;
    document.getElementById("saiQtdMax").innerText = `Disponível: ${maxQtd}`;
    document.getElementById("saiQtd").max = maxQtd;
    document.getElementById("saiData").value = new Date().toISOString().split("T")[0];
    carregarTalhoes();
    toggleTalhaoSelect();
    document.getElementById("modalSaida").style.display = "flex";
}

function fecharModalSaida() {
    document.getElementById("modalSaida").style.display = "none";
}

function toggleTalhaoSelect() {
    const motivo = document.getElementById("saiMotivo").value;
    const container = document.getElementById("saiTalhaoContainer");
    if (motivo === "Aplicação") {
        container.style.display = "block";
    } else {
        container.style.display = "none";
        document.getElementById("saiTalhao").value = "";
    }
}

async function salvarSaida() {
    const produto_id = document.getElementById("saiProdutoId").value;
    const quantidade = document.getElementById("saiQtd").value;
    const motivo = document.getElementById("saiMotivo").value;
    const dataMov = document.getElementById("saiData").value;
    const talhao_id = document.getElementById("saiTalhao").value;
    
    if(!quantidade || quantidade <= 0) {
        showToast("Informe uma quantidade válida.", "error");
        return;
    }
    
    if(motivo === "Aplicação" && !talhao_id) {
        showToast("Selecione um talhão para a aplicação.", "error");
        return;
    }

    const payload = {
        produto_id,
        tipo: "SAIDA",
        quantidade,
        motivo,
        data: dataMov,
        talhao_id,
        observacao: document.getElementById("saiObs").value
    };

    try {
        const res = await fetch("/api/estoque/movimentacoes/", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
            showToast("Saída registrada com sucesso!");
            fecharModalSaida();
            carregarEstoque();
            carregarMovimentacoes();
        } else {
            showToast(data.message, "error");
        }
    } catch(e) {
        showToast("Erro de rede.", "error");
    }
}

// ================= RELATÓRIO PDF ================= //

function abrirModalRelatorio() {
    document.getElementById("modalRelatorio").style.display = "flex";
}

function fecharModalRelatorio() {
    document.getElementById("modalRelatorio").style.display = "none";
}

function imprimirRelatorio(tipo) {
    fecharModalRelatorio();
    
    const div = document.createElement("div");
    div.className = "print-area";
    div.style.background = "white";
    div.style.padding = "20px";
    
    const dataHoje = new Date().toLocaleDateString("pt-BR");
    let html = `
        <div style="text-align:center; margin-bottom: 2rem;">
            <h2>GOLDCROP - RELATÓRIO DE ESTOQUE</h2>
            <p>Data de geração: ${dataHoje}</p>
        </div>
    `;
    
    if (tipo === "atual" || tipo === "baixo") {
        html += `
            <h3>Produtos</h3>
            <table style="width:100%; border-collapse:collapse; margin-top:1rem;">
                <tr style="border-bottom:1px solid #000; text-align:left;">
                    <th style="padding:8px">Produto</th>
                    <th style="padding:8px">Categoria</th>
                    <th style="padding:8px; text-align:right;">Qtd</th>
                    <th style="padding:8px">Und</th>
                    <th style="padding:8px">Status</th>
                </tr>
        `;
        
        produtosGlobal.forEach(p => {
            if (tipo === "baixo" && p.status === "success") return;
            let st = p.status === "danger" ? "Sem Estoque" : (p.status === "warning" ? "Baixo" : "Normal");
            html += `
                <tr style="border-bottom:1px solid #ccc;">
                    <td style="padding:8px">${p.nome}</td>
                    <td style="padding:8px">${p.categoria}</td>
                    <td style="padding:8px; text-align:right;">${p.quantidade_atual}</td>
                    <td style="padding:8px">${p.unidade}</td>
                    <td style="padding:8px">${st}</td>
                </tr>
            `;
        });
        html += `</table>`;
    } else if (tipo === "movimentacoes") {
        html += `
            <h3>Histórico Recente</h3>
            <table style="width:100%; border-collapse:collapse; margin-top:1rem;">
                <tr style="border-bottom:1px solid #000; text-align:left;">
                    <th style="padding:8px">Data</th>
                    <th style="padding:8px">Produto</th>
                    <th style="padding:8px">Tipo</th>
                    <th style="padding:8px; text-align:right;">Qtd</th>
                    <th style="padding:8px">Motivo</th>
                    <th style="padding:8px">Talhão</th>
                </tr>
        `;
        
        const tbody = document.getElementById("listaMovimentacoes");
        const rows = tbody.querySelectorAll("tr");
        rows.forEach(r => {
            if(r.cells.length > 1) {
                html += `
                    <tr style="border-bottom:1px solid #ccc;">
                        <td style="padding:8px">${r.cells[0].innerText}</td>
                        <td style="padding:8px">${r.cells[1].innerText}</td>
                        <td style="padding:8px">${r.cells[2].innerText}</td>
                        <td style="padding:8px; text-align:right;">${r.cells[3].innerText}</td>
                        <td style="padding:8px">${r.cells[4].innerText}</td>
                        <td style="padding:8px">${r.cells[5].innerText}</td>
                    </tr>
                `;
            }
        });
        html += `</table>`;
    }
    
    div.innerHTML = html;
    document.body.appendChild(div);
    
    setTimeout(() => {
        window.print();
        document.body.removeChild(div);
    }, 500);
}
