# GoldCrop — documentação técnica e funcional completa

> **Escopo:** guia de referência para a versão do sistema presente neste
> repositório. As rotas, regras e limitações abaixo foram conferidas no código
> Django, nos templates, no JavaScript e nos documentos técnicos existentes.
> Quando algo é apenas estrutura preparada, demonstração ou indisponível, isso
> é indicado explicitamente.

## 1. Visão geral

O GoldCrop é uma aplicação web em português especializada em propriedades
produtoras de café. Reúne cadastro de fazenda e equipe, talhões de café,
previsão meteorológica, análises de janelas operacionais, planejamentos,
aplicações, calendário, estoque e rotinas administrativas.

O projeto é uma aplicação Django monolítica: o Django entrega páginas HTML por
templates, fornece APIs JSON para o navegador e persiste os dados pelo ORM.
O frontend usa JavaScript sem framework. As informações operacionais são
separadas por fazenda e a maioria das operações requer uma sessão autenticada.

### O que o produto não promete

- IEA, janelas e classificações são apoio à decisão, não garantia agronômica.
- A previsão meteorológica não é uma leitura ao vivo de estação ou sensor.
- A umidade do solo indicada pela previsão é modelada; não comprova telemetria.
- A triagem fitossanitária não conhece automaticamente o produto nem sua bula.
- A tela de sensores e os modelos IoT não significam que há sensores físicos
  conectados.
- As áreas circulares do mapa representam centro e raio aproximados; não são
  limites geográficos oficiais de talhão.

## 2. Tecnologias e arquitetura

| Camada | Tecnologia/implementação |
|---|---|
| Servidor | Python 3.12 ou superior; Django `>=5.2,<7.0` |
| Banco local | SQLite em `db.sqlite3` |
| Banco remoto | PostgreSQL por URL, com `dj-database-url` e `psycopg` |
| Interface | Django Templates, HTML, CSS e JavaScript vanilla |
| Mapa | Leaflet e tiles do OpenStreetMap |
| Previsão | Open-Meteo Forecast API, consultada pelo navegador |
| Assistente generativo | OpenRouter, opcional e chamada pelo servidor |
| Hospedagem configurada | Vercel, através de `vercel.json` e `build.py` |

### Caminho típico de uma operação

1. A pessoa abre uma página renderizada pelo Django.
2. O JavaScript consulta uma rota `/api/.../` com a sessão do navegador.
3. A view identifica a pessoa e a fazenda selecionada na sessão.
4. A view valida os dados e as permissões e usa os modelos Django.
5. A resposta JSON informa sucesso, dados ou erro; o navegador atualiza a tela.

O conteúdo JSON enviado ao servidor deve ser codificado em UTF-8. As chamadas
de escrita usam sessão e proteção CSRF do Django. Não há API pública com token
ou esquema OpenAPI no projeto.

### Estrutura do repositório

```text
goldcrop_project/       Configuração, rotas raiz e análise auxiliar Python
dashboard/              Fazendas, talhões, clima, aplicações, estoque e calendário
gestao/                 Financeiro, safras, serviços, máquinas, relatórios e assistente
pecuaria/               Modelos e migrações históricos, sem interface ativa
templates/              Páginas e componentes HTML do Django
static/                 CSS, JavaScript e motor de análise do navegador
tests/                  Testes JavaScript com Node
*/migrations/           Histórico de alterações do esquema do banco
manage.py               CLI de administração Django
build.py                Verificações e migrações no build da Vercel
vercel.json             Configuração de build da Vercel
requirements.txt        Dependências Python
```

Arquivos principais:

- `goldcrop_project/settings.py`: ambiente, banco, autenticação, segurança,
  templates e arquivos estáticos.
- `goldcrop_project/urls.py`: inclui as rotas `dashboard` e `gestao`, além do
  Django Admin.
- `dashboard/models.py` e `gestao/models.py`: esquema de dados ativo.
- `pecuaria/models.py` e suas migrations permanecem apenas como legado para
  preservar dados existentes; páginas, APIs e administração foram removidas.
- `dashboard/views.py` e `gestao/views.py`: páginas e APIs ativas.
- `static/app.js`: inicialização e integração principal do frontend agrícola.
- `static/analysis/GoldCropAnalysisEngine.js`: cálculo do IEA da Janela de Adubação.
- `dashboard/pesticides.py`: avaliação meteorológica fitossanitária no servidor.

## 3. Instalação e execução local (Windows)

Abra **PowerShell** na pasta do projeto (não no diretório `System32`) e rode:

```powershell
cd "C:\Users\<usuario>\OneDrive\Área de Trabalho\PROJETOS\GoldCrop"
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py check
python manage.py runserver
```

Endereços locais:

- Aplicação: `http://127.0.0.1:8000/`
- Admin Django: `http://127.0.0.1:8000/admin/`

Para criar uma conta de administração local:

```powershell
python manage.py createsuperuser
```

Se a política do PowerShell impedir a ativação do ambiente virtual, é possível
chamar o executável diretamente: `.\.venv\Scripts\python.exe manage.py
runserver`. O servidor de desenvolvimento só deve ser usado localmente, não
como servidor de produção.

### Testes

```powershell
python manage.py check
python manage.py test
node --test
```

Os testes Python cobrem os fluxos de dashboard, cadastro/autenticação,
fazendas/equipe/notificações, calendário, estoque, análise fitossanitária e
gestão/assistente, além de verificar que as rotas antigas não estão expostas.
Os testes Node cobrem o motor de análise,
formatação do calendário e relatórios de estoque. Execute o conjunto completo
antes de publicar alterações.

## 4. Configuração por ambiente

As configurações devem ser definidas como variáveis de ambiente. `.env.example`
contém somente nomes e valores vazios/de exemplo; a aplicação não carrega
automaticamente um arquivo `.env`.

| Variável | Uso e comportamento |
|---|---|
| `DEBUG` | Por padrão fica ligado fora da Vercel e desligado na Vercel. Em produção deve permanecer desligado. |
| `VERCEL` | Quando igual a `1`, ativa validações específicas de produção/Vercel. |
| `VERCEL_ENV` | No build Vercel deve ser `production`, `preview` ou `development`. |
| `SECRET_KEY` | Obrigatória em produção; chave única, aleatória, com no mínimo 50 caracteres. Não versionar. |
| `DATABASE_URL` | URL preferencial do banco; também são aceitas `POSTGRES_URL` ou `STORAGE_URL`. |
| `ALLOWED_HOSTS` | Hosts adicionais separados por vírgula. `*` não é permitido em produção. |
| `VERCEL_URL` | Host Vercel do deploy, usado para montar hosts permitidos. |
| `VERCEL_PROJECT_PRODUCTION_URL` | Host de produção, usado para montar hosts permitidos. |
| `CSRF_TRUSTED_ORIGINS` | Origens HTTPS adicionais, separadas por vírgula. |
| `SECURE_SSL_REDIRECT` | Em produção o padrão é redirecionar HTTP para HTTPS. |
| `SESSION_COOKIE_SECURE` | Em produção o padrão é exigir cookie de sessão via HTTPS. |
| `CSRF_COOKIE_SECURE` | Em produção o padrão é exigir cookie CSRF via HTTPS. |
| `SECURE_HSTS_SECONDS` | Padrão de produção: 31536000 segundos; precisa ser maior que zero. |
| `SECURE_HSTS_INCLUDE_SUBDOMAINS` | Habilita HSTS para subdomínios quando definido. |
| `SECURE_HSTS_PRELOAD` | Habilita o sinalizador HSTS preload quando definido. |
| `TRUST_X_FORWARDED_PROTO` | Na Vercel o padrão confia no protocolo encaminhado pelo proxy. |
| `OPENROUTER_API_KEY` | Opcional; credencial do assistente generativo, somente no ambiente do servidor. |
| `OPENROUTER_MODEL` | Modelo OpenRouter; opcional, padrão `openrouter/free`. |
| `EMAIL_BACKEND` | Backend Django de e-mail; padrão SMTP. |
| `EMAIL_HOST`, `EMAIL_PORT` | Host SMTP e porta; padrão porta 587. |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | Credenciais SMTP. |
| `EMAIL_USE_TLS`, `EMAIL_USE_SSL` | Opções SMTP; TLS ligado por padrão e SSL desligado. Não habilitar TLS e SSL simultaneamente. |
| `DEFAULT_FROM_EMAIL` | Remetente necessário para envio de redefinição de senha. |

Em desenvolvimento, configure OpenRouter só se quiser usar perguntas gerais
que não são respondidas localmente. Em PowerShell:

```powershell
$env:OPENROUTER_API_KEY = "chave-nova"
$env:OPENROUTER_MODEL = "openrouter/free"
python manage.py runserver
```

Esses valores valem somente para a janela do PowerShell em que foram definidos.
Não cole credenciais em código, templates, documentação, commits ou conversas.
Se uma chave tiver sido exposta, revogue-a no provedor e gere outra.

### Produção na Vercel

1. Configure uma base PostgreSQL persistente usando `DATABASE_URL` (ou uma das
   alternativas aceitas), uma `SECRET_KEY` forte e demais variáveis necessárias.
2. Cadastre a chave OpenRouter no **projeto** Vercel, como `OPENROUTER_API_KEY`,
   se for usar o assistente geral. Selecione os ambientes de deploy desejados.
3. O comando de build definido é `python build.py`.
4. O build executa `check --deploy` e verifica se não há migrações pendentes.
5. Em deploy `production`, `build.py` executa `migrate`; em preview/development,
   não executa migrações.
6. Após alterar variáveis, faça novo deploy/redeploy para que a função receba
   os valores.

Em produção o projeto falha de propósito quando faltam configurações críticas:
`SECRET_KEY`, banco persistente, HTTPS/cookies seguros/HSTS e `VERCEL_ENV`
válido no build Vercel. SQLite local não deve ser usado como banco persistente
de produção/serverless.

## 5. Identidade, sessão, fazenda e permissões

### Conta

- A autenticação usa `django.contrib.auth` e sessão de navegador.
- O login aceita e-mail ou username; no cadastro o username é o e-mail.
- Perfil complementar fica em `PerfilProdutor`: nome completo e telefone.
- Senha é validada pelos validadores Django (mínimo 10 caracteres, comparação
  com dados pessoais, senhas comuns e senha numérica), além da validação de
  letras e números feita pelo cadastro.
- Recuperação de senha requer SMTP configurado. A tela de confirmação usa as
  views de autenticação do Django.
- `AcessoSistema` registra login/cadastro com a fazenda ativa, quando existe.

### Fazenda ativa

Uma pessoa pode ter acesso a mais de uma fazenda. A fazenda selecionada fica na
sessão (`current_farm_id`). Se a seleção não existe ou deixa de ser acessível,
o backend escolhe a primeira fazenda acessível por nome/ID. As APIs sempre
filtram os registros pela fazenda ativa, evitando que um ID de outra fazenda
seja suficiente para acessar dados.

O onboarding cria a fazenda, associa o criador como proprietário e cria
talhões numerados (`Talhão 01`, etc.) conforme a quantidade informada. Esses
talhões começam sem coordenadas.

O código de acesso da fazenda tem formato `GCRP-XXXX-XXXX`, usando um alfabeto
que evita caracteres ambíguos. Um usuário autenticado pode entrar na fazenda
por esse código; não há convite por e-mail no fluxo descrito. A entrada ativa
o vínculo e gera notificação aos membros.

### Papéis e permissões

Os papéis armazenados são `OWNER` (Proprietário) e `MEMBER` (Membro). Vínculos
também têm status `ACTIVE`, `PENDING` ou `INACTIVE`. No estado atual, a tabela
de permissões do backend inclui os dois papéis em `view`, `manage`, `plan`,
`record` e `team`; portanto, a diferença entre proprietário e membro não
restringe essas operações pelas views atuais. O proprietário que criou a
fazenda não pode ser removido, e um membro não pode remover a si próprio.

| Permissão | Uso típico |
|---|---|
| `view` | Consultar telas e dados da fazenda |
| `manage` | Alterar dados da fazenda, equipe, talhões, produtos/ativos e excluir eventos |
| `plan` | Criar/editar eventos e planejamentos |
| `record` | Registrar aplicações, movimentos, lançamentos e registros pecuários |
| `team` | Consultar/alterar código de acesso e gerenciar membros |

O sistema gera notificações para entrada de membro, nova recomendação,
planejamento e aplicação realizada. Cada pessoa lê e marca as próprias
notificações da fazenda ativa.

## 6. Páginas e módulos

### Acesso e configuração da propriedade

| Página | Rota | Observação |
|---|---|---|
| Login | `/login/` | E-mail/senha, lembrar sessão e recuperação |
| Cadastro | `/cadastro/` | Cria usuário e perfil; depois direciona para onboarding |
| Boas-vindas/onboarding | `/fazendas/boas-vindas/` | Acesso autenticado sem fazenda |
| Visão geral | `/dashboard/` ou `/` | Resumo da fazenda, talhões e contexto selecionado |
| Fazenda/equipe | `/fazenda/` | Informações da fazenda, membros, código e notificações |
| Configurações | `/configuracoes/` | Perfil e configurações apresentadas pela interface |

### Operação agrícola

| Página | Rota | Principais dados |
|---|---|---|
| Talhões | `/talhoes/` | Lista/mapa, cadastro, edição e detalhes de talhões |
| Janela de Adubação | `/janela-de-ouro/` | IEA e janelas favoráveis para adubar |
| Janela de Pulverização | `/janela-fitossanitaria/` | Triagem horária/dia, alertas, intervalos e condições |
| Calendário | `/calendario/` | Eventos e atividades da fazenda |
| Aplicações | `/aplicacoes/` | Planejamento e registro de aplicações |
| Histórico | `/historico/` | Consulta de registros de aplicação |
| Estoque | `/estoque/` | Produtos, saldos, movimentos e relatórios imprimíveis |
| Sensores | `/sensores/` | Tela informativa; telemetria real não está habilitada |

### Gestão

| Página | Rota | Principais dados |
|---|---|---|
| Financeiro | `/gestao/financeiro/` | Receitas, despesas e compras |
| Safras | `/gestao/safras/` | Safras de café, variedade, área, talhões e datas |
| Serviços | `/gestao/servicos/` | Serviços contratados/prestados e status |
| Equipamentos | `/gestao/equipamentos/` | Máquinas e manutenção |
| Registros | `/gestao/registros/` | Consulta/criação simplificada de eventos |
| Relatórios | `/gestao/relatorios/` | Resumo derivado de financeiro e estoque |
| Assistente IA | `/gestao/assistente/` | Consultas locais, propostas confirmáveis e respostas gerais opcionais |

Páginas internas redirecionam pessoas sem sessão para login e pessoas sem
fazenda para onboarding. A administração Django fica em `/admin/`.

## 7. Regras funcionais por módulo

### 7.1 Talhões, mapa e seleção

Um talhão pertence a uma fazenda. Nome é único dentro daquela fazenda. O
registro inclui área, cultura, variedade, idade, solo, código de sensor,
latitude, longitude, raio e status ativo. Os formulários comuns de talhão
editam principalmente nome, área, cultura, coordenadas e raio; alguns campos
existem apenas no modelo/admin.

Coordenadas são específicas de cada talhão e limitadas a latitude `[-90, 90]`
e longitude `[-180, 180]`. A tela usa mapa Leaflet/OpenStreetMap para escolher
um ponto. O círculo desenhado usa o raio aproximado cadastrado; não há
polígono de limites. Talhão sem coordenadas permanece cadastrado, mas não
permite consulta climática por localização.

A seleção do talhão é compartilhada pelo frontend entre módulos que dependem
do contexto. Recomendação, coleta, planejamento, aplicação e histórico devem
continuar ligados ao ID do próprio talhão. Excluir talhão é uma exclusão real;
relações configuradas como `SET_NULL` podem manter histórico sem a ligação ao
talhão.

### 7.2 Clima e Janela de Adubação

O navegador consulta Open-Meteo usando as coordenadas do talhão selecionado e
`timezone=auto`; não usa a localização do visitante. O frontend normaliza os
dados atuais, horários, diários e estimativas modeladas de solo; persiste a
coleta pela API do GoldCrop e calcula recomendações com
`static/analysis/GoldCropAnalysisEngine.js`.

O IEA é um escore de adequação meteorológica à operação, entre 0 e 100. Pesos
atuais: umidade do solo 20%, chuva 15%, distribuição da chuva 10%, ET0 15%,
vento 10%, temperatura 10%, umidade relativa 10% e risco adicional 10%. A
nota do fator de risco adicional é fixa em 100 (contribui 10 pontos); riscos
operacionais são avaliados também separadamente. A confiança mede suficiência
de dados e não deve ser confundida com o IEA. A decisão pode ser insuficiência
ou bloqueio por risco mesmo para um IEA alto.

Faixas exibidas: 0–20 muito desfavorável, 21–40 desfavorável, 41–60 atenção,
61–80 favorável e 81–100 Janela de Adubação. O motor avalia janelas de quatro
horas com inícios a cada hora e horizonte máximo de sete dias. A recomendação
precisa de confiança mínima; riscos altos de lixiviação, escorrimento ou deriva
podem impedir APPLY. Veja [LOGICA_IEA.txt](./LOGICA_IEA.txt) para a descrição
detalhada de cada curva, penalidade e critério.

### 7.3 Janela de Pulverização

`dashboard/pesticides.py` avalia cada hora futura, agrupa horas consecutivas
com a mesma classificação e exige pelo menos duas horas para apresentar uma
janela favorável. Usa a previsão horária do talhão, exige fuso válido e
previsão com no máximo 12 horas; ausência de dados necessários produz
`insufficient`, em vez de preencher zero.

Critérios de triagem atuais:

- vento acima de 15 km/h ou rajada acima de 20 km/h: desfavorável;
- precipitação maior que zero ou probabilidade de chuva de pelo menos 60%
  durante/depois do horário (janela consultada até duas horas adiante):
  desfavorável;
- probabilidade de 30% ou mais: atenção;
- temperatura abaixo de 10 °C ou acima de 32 °C: atenção;
- umidade relativa abaixo de 30% ou acima de 95%: atenção.

É uma triagem meteorológica genérica. A rota GET atual não recebe ou aplica a
bula específica. Existe suporte POST legado para uma etiqueta de produto com
limites informados e confirmação explícita de que foram conferidos, mas esses
limites são fornecidos pelo cliente; o sistema não valida bula externa.
Consulte [JANELA_FITOSSANITARIA.txt](./JANELA_FITOSSANITARIA.txt).

### 7.4 Planejamento, aplicações e calendário

Planejamento e execução são registros diferentes:

- `PlanejamentoAplicacao` guarda talhão, produto, tipo, dose, data/horário,
  responsável, observações, status e, opcionalmente, recomendação.
- `ExecucaoAplicacao` registra produto, tipo, quantidades planejada/realizada,
  data/horário, status, IEA previsto e vínculos ao planejamento/recomendação.
- Uma execução pode alterar o status do planejamento; planejamento por si só
  não indica que a operação foi realizada.
- Uma execução vinculada a recomendação pode ser comparada com o intervalo
  recomendado para indicar dentro/fora da janela.

O calendário aceita eventos de dia inteiro ou com horários, categoria, status,
prioridade, talhão, responsável, observações, origem e associações opcionais a
aplicação, produto e recomendação. Horário final precisa ser posterior ao
inicial. Recomendação só pode virar evento pelo fluxo explícito e quando a
decisão salva é `APPLY` e o IEA é pelo menos 75; talhão e data precisam
corresponder à recomendação.

### 7.5 Estoque

`Produto` guarda nome, categoria, unidade, estoque mínimo, local, observação,
saldo e estado ativo. `MovimentacaoEstoque` guarda entrada/saída, quantidade,
motivo, data, talhão opcional, fornecedor, valor e autor.

- GET lista produtos ativos da fazenda e sua situação.
- POST cadastra produto; saldo inicial positivo cria uma movimentação de
  entrada.
- Uma movimentação exige quantidade positiva e motivo.
- Saída maior que o saldo disponível é bloqueada.
- Saída com motivo exatamente `Aplicação` e talhão cria também execução de
  aplicação.
- Situação `danger`: saldo zero; `warning`: saldo positivo até o mínimo;
  `success`: saldo acima do mínimo.
- Dashboard resume estoque baixo, zerado, categorias e movimentações. A tela
  inclui impressão/salvamento de relatórios pelo navegador.

### 7.6 Safras e cafeicultura

Fazendas e talhões novos usam café como cultura principal. Os talhões registram
área, variedade e idade da lavoura; safras existentes registram cultura,
variedade, área, datas, status e talhões relacionados. O calendário contempla
florada, formação dos frutos, maturação, colheita e pós-colheita, além de
adubação, irrigação e controle fitossanitário.

Não existe modelo confiável de produção colhida em sacas por talhão; o sistema
não calcula produtividade nem infere valores a partir de área ou eventos.

Os modelos e migrations do antigo módulo pecuário foram mantidos para preservar
dados já existentes, mas suas páginas, rotas, APIs, arquivos estáticos e
registros no Admin foram removidos.

### 7.7 Gestão

O módulo contém financeiro, safras, serviços, equipamentos, registros e
relatórios. As APIs de listagem retornam no máximo 200 itens nos módulos
financeiros/safras/serviços/equipamentos/registros. Relatórios agregam período
do primeiro dia do mês até hoje, estoque baixo, serviços pendentes e
equipamentos em manutenção.

### 7.8 Assistente

O endpoint `/gestao/api/assistente/` verifica autenticação, fazenda selecionada
e permissão de visualização antes de consultar. O interpretador local reconhece
intenção, módulo, categoria e períodos usuais (hoje, ontem, semana, mês, ano,
últimos dias e datas informadas). Consultas locais incluem fazenda e talhões,
variedades/áreas/idade, safras, aplicações, calendário, janelas meteorológicas,
estoque/histórico, finanças por categoria/período, relatórios, serviços e
equipamentos. Essas respostas não consomem tokens.

As consultas permitidas para contexto generativo ficam em `gestao/assistant.py`
na lista `QUERY_TOOLS`. Cada ferramenta aplica filtro pela fazenda ativa,
seleciona somente campos necessários e limita os resultados. Não há SQL
fornecido pelo modelo nem acesso livre ao ORM. O backend executa as ferramentas
relevantes antes de chamar OpenRouter, reduz os resultados a JSON compacto e
envia o contexto somente quando a pergunta pede dados da fazenda ou uma análise
cruzada. A mensagem é limitada a 1.500 caracteres, o contexto de dados a 5.000
caracteres e a resposta do modelo a 400 tokens. Perguntas genéricas não recebem
dados da fazenda.

O contexto conversacional fica na sessão, associado ao usuário e à fazenda
ativa. São mantidos no máximo quatro turnos resumidos; somente os dois mais
recentes relacionados aos módulos da pergunta atual podem acompanhar uma
pergunta generativa. Turnos de estoque, por exemplo, não são enviados junto com
uma pergunta apenas financeira. Trocar usuário ou fazenda descarta o contexto
anterior. Mensagens e respostas não são gravadas no banco de métricas.

Respostas locais estáveis podem ser armazenadas por até 120 segundos. A chave
inclui usuário, fazenda, mensagem normalizada/filtros e uma geração da fazenda.
Sinais de gravação/exclusão dos modelos consultados invalidam essa geração após
o commit. Saldos de estoque, consultas financeiras, operações de escrita e
consultas meteorológicas atuais ou relatórios que agregam saldos e valores não
usam esse cache. O cache padrão do Django é local ao processo; deployments com
múltiplos workers precisam configurar um backend compartilhado para compartilhar
cache entre processos.

O modelo financeiro não tem vínculo estruturado com talhão ou safra e não há
campo confiável de produção colhida por talhão. Por isso, o assistente explica
essas limitações em vez de calcular gastos por hectare, atribuir despesas a
uma safra ou inventar produtividade em sacas.

Operações de escrita podem preparar lançamento financeiro, entrada/saída de
estoque ou atividade cafeeira. A proposta fica na sessão, vinculada ao usuário
e à fazenda, expira em 10 minutos e só é gravada após ação `confirm`; `cancel`
descarta a proposta. Saldos e permissões são verificados novamente na
confirmação.

O modelo `AssistenteUso`, consultável por administradores no Django Admin,
registra a funcionalidade, resolução local/cache/OpenRouter/erro, duração,
chamada ao provedor e tokens de entrada/saída quando o provedor os informa.
Não armazena o texto das perguntas. Sem `OPENROUTER_API_KEY`, consultas locais
continuam disponíveis e perguntas que realmente precisam da API retornam HTTP
503. O navegador também oferece ditado por voz quando o browser disponibiliza
SpeechRecognition.

## 8. Modelos e relações do banco

Todos os registros operacionais principais têm relação com `Fazenda`, direta
ou por produto/talhão. As exclusões em cascata e `SET_NULL` são definidas no
código dos modelos; confira as migrations antes de alterar o banco.

### `dashboard`

| Modelo | Finalidade e relações principais |
|---|---|
| `PerfilProdutor` | Um-para-um com usuário Django; nome, telefone e timestamps. |
| `Fazenda` | Dono, UUID, código de acesso, nome, endereço, área, número de talhões, culturas JSON, cultivo, irrigação e timestamps. Nome é único por produtor. |
| `MembroFazenda` | Associação usuário/fazenda, papel, status e timestamps; usuário/fazenda únicos. |
| `AcessoSistema` | Auditoria de acesso com usuário/fazenda opcionais e timestamp. |
| `NotificacaoFazenda` | Fazenda, destinatário, ator, tipo, título, mensagem, leitura e criação. |
| `Talhao` | Fazenda, nome, área, cultura/variedade, idade, solo, código sensor, coordenadas, raio e ativo; nome único por fazenda. |
| `PlanejamentoAplicacao` | Fazenda, talhão/recomendação opcionais, produto/tipo/dose, data/horários, status e autor. |
| `ExecucaoAplicacao` | Fazenda, talhão/planejamento/recomendação opcionais, status, insumo, quantidades, data/horário, IEA e autor. |
| `ColetaMeteorologica` | Fazenda/talhão, fonte, instante, coordenadas, fuso e JSON para dados atuais/horários/diários/solo/brutos. |
| `RecomendacaoJanela` | Fazenda/talhão/coleta, tipo, contexto, intervalo, adequação, classificação, confiança, decisão, fatores, riscos e métricas JSON. |
| `ResultadoJanela` | Resultado reportado (realizada/adiada/cancelada), condições observadas e texto. |
| `ParametroTecnicoOperacao` | Parâmetros por fazenda, tipo/produto/método, JSON, fonte e data verificada. |
| `SensorIoT` | Identificador/tipo/ativo com fazenda e talhão opcional. |
| `LeituraSensorIoT` | Sensor, instante, umidade, temperatura e dados JSON. |
| `Produto` | Produto de estoque por fazenda, unidade, saldo/mínimo, categoria, local e ativo. |
| `MovimentacaoEstoque` | Produto, entrada/saída, quantidade, motivo, data, talhão opcional, fornecedor/valor e autor. |
| `EventoCalendario` | Fazenda, autor, título, descrição, data/horas, categoria/status/prioridade, talhão, origem e vínculos a aplicação/produto/recomendação. |

Operações definidas em `RecomendacaoJanela.Operacao`: adubação,
fitossanitária, plantio e mecanizada. `EventoCalendario.Categoria` contempla aplicação, plantio, colheita, florada,
formação dos frutos, maturação, pós-colheita, adubação, irrigação,
pulverização, manejo, inspeção, manutenção, compra, venda, reunião, visita
técnica, tarefa e outro.

### `gestao`

| Modelo | Campos principais |
|---|---|
| `LancamentoFinanceiro` | Fazenda, tipo (receita/despesa/compra), título, categoria, valor positivo, data, observação e autor. |
| `Safra` | Fazenda, cultura (café), variedade, ano, área, datas, status, talhões associados e observação. |
| `ServicoFazenda` | Fazenda, nome, contratado/prestado, pessoa/local/quantidade, valor opcional, data, status e observação. |
| `EquipamentoAgricola` | Fazenda, nome/tipo/identificação, horímetro, status, datas de manutenção e observação. |
| `AssistenteUso` | Fazenda/usuário, funcionalidade, resolução local/cache/OpenRouter/erro, tokens informados pelo provedor, duração e indicadores de cache/API; não armazena mensagens. |

O app `pecuaria` ainda consta em `INSTALLED_APPS` exclusivamente para manter o
histórico de modelos e migrations do banco. Não há rotas ativas, views, telas
ou modelos registrados no Admin; os dados históricos não são apagados.

## 9. Catálogo das APIs

As rotas abaixo são montadas em `goldcrop_project/urls.py` pelos conjuntos
dashboard (prefixo vazio) e gestão (`/gestao/`).
Salvo rotas de autenticação/cadastro, as APIs dependem de sessão autenticada e
fazenda ativa. JSON inválido retorna erro; respostas de erro seguem em geral
`{"ok": false, "message": "...", "field_errors": {...}}`.

### Autenticação, fazenda e perfil

| Método e rota | Uso / campos relevantes |
|---|---|
| `POST /api/auth/cadastro/` | `nome`, `email`, `telefone`, `senha`; cria usuário/perfil, inicia sessão e responde `redirect_url`. |
| `POST /api/auth/login/` | `email` (e-mail ou username), `password`, `remember_me`; abre sessão e responde redirecionamento. |
| `POST /api/auth/password-reset/` | `email`; requer SMTP completo; resposta não revela se a conta existe. |
| `POST /logout/` | Encerra sessão. |
| `GET /api/farms/` | Lista fazendas acessíveis e fazenda selecionada. |
| `POST /api/farms/` | `farm_id`; seleciona uma fazenda já acessível. |
| `POST /api/farms/create/` | `name`, `cep`, `state`, `city`, `district`, `address`, `area`, `plot_count`, `culture` (café), `farm_type`, `irrigation`; cria fazenda, proprietário e talhões. |
| `POST /api/farms/join/` | `access_code`; associa usuário autenticado à fazenda. |
| `POST /api/farms/access-code/` | Gera/renova código de acesso da fazenda ativa. |
| `POST /api/farms/settings/` | `name`, `culture` (café), `area`; atualiza nome, cultura principal e área. |
| `GET /api/farms/team/` | Lista membros; código só é incluído para quem tem `team`. |
| `DELETE /api/farms/team/<user_id>/` | Remove membro, exceto o próprio solicitante e o criador proprietário. |
| `GET /api/notifications/` | Retorna até 50 notificações da pessoa/fazenda e total não lido. |
| `POST /api/notifications/<id>/read/` | Marca notificação própria como lida. |
| `POST /api/profile/` | `name`, `email`, `phone`; atualiza perfil/conta; `farm` opcional e sujeito à permissão `manage`. |

### Estado agrícola, talhões, clima e aplicações

| Método e rota | Uso / campos relevantes |
|---|---|
| `GET /api/state/?talhao_id=<id>` | Estado da fazenda ativa: fazenda/permissões, talhões ativos, previsão associada, aplicações, planejamentos e recomendações. |
| `POST /api/talhoes/` | `nome`, `area`, `cultura` (café), `variedade`, `idade_anos`, `latitude`, `longitude`, `raio`; cria talhão (pode receber coordenadas decimais ou formato compacto aceito pelo parser). |
| `POST` ou `PUT /api/talhoes/<id>/` | Atualiza nome/área/variedade/idade/coordenadas/raio de talhão da fazenda ativa; cultura permanece café. |
| `POST` ou `DELETE /api/talhoes/<id>/delete/` | Exclui talhão da fazenda ativa. |
| `POST /api/weather/ingest/` | Coleta com `fetchedAt`, `location` e dados `current`, `hourly`, `daily`, `soil`; opcional `talhao_id`/`referenceTalhaoId`. |
| `POST /api/recommendations/ingest/` | `talhao_id`, `recommendations[]`; salva recomendações da coleta daquele talhão. |
| `GET /api/pesticide-recommendations/?talhao_id=<id>` | Triagem meteorológica automática da previsão salva do talhão. |
| `POST /api/pesticide-recommendations/` | Compatibilidade legada; corpo inclui `talhao_id` e etiqueta confirmada do produto/limites da bula. |
| `POST /api/planejamentos/` | `talhao_id`, `produto`, `tipo_aplicacao`, dose/unidade, `data_planejada`, horários, responsável, observação e `recomendacao_id` opcional. |
| `POST /api/planejamentos/<id>/exec/` | `data_real`, `horario_real`, quantidades planejada/realizada, status e observações; registra execução. |
| `POST /api/applications/` | Registro direto: talhão por ID ou nome, `data`, produto/tipo/dose/quantidade, horário, observações, status e `planejamento_id` opcional. |
| `GET /api/analytics/` | Totais de aplicações, execução/cancelamento, ocorrências dentro/fora da recomendação, IEA médio e área monitorada. |

O JSON das previsões usa timestamps e séries horárias alinhadas por índice; o
formato detalhado de entrada é implementado pelo frontend em `static/app.js`.
Dados ausentes não devem ser serializados como se fossem leituras iguais a
zero.

### Calendário e estoque

| Método e rota | Uso / campos relevantes |
|---|---|
| `GET /api/calendar/events/?start=AAAA-MM-DD&end=AAAA-MM-DD` | Eventos em intervalo de até 63 dias e opções de categoria/status/prioridade, talhões, produtos, aplicações e permissões. |
| `POST /api/calendar/events/` | Cria evento: `title`, `date`, horários ou `all_day`, categoria, status, prioridade, talhão/responsável/descrição/observações e IDs relacionados opcionais. |
| `PUT /api/calendar/events/<id>/` | Atualiza conteúdo do evento. |
| `PATCH /api/calendar/events/<id>/` | Corpo exclusivamente `{"status": "<status>"}`. |
| `DELETE /api/calendar/events/<id>/` | Exclui evento (requer `manage`). |
| `GET /api/estoque/produtos/` | Lista produtos ativos, saldo, unidade e situação. |
| `POST /api/estoque/produtos/` | Nome, categoria, unidade, estoque mínimo, local/observação e estoque inicial opcional. |
| `GET /api/estoque/movimentacoes/` | Até 100 movimentações recentes da fazenda. |
| `POST /api/estoque/movimentacoes/` | `produto_id`, `tipo` (`ENTRADA`/`SAIDA`), quantidade, motivo, data opcional, talhão/fornecedor/valor/observação opcionais. |
| `GET /api/estoque/dashboard/` | Resumo, alertas, categorias, totais dos últimos 30 dias, consumo por talhão e oito movimentos recentes. |

### Gestão

Todos usam `/gestao/api/`; GET consulta, POST cria, salvo relatórios que são
somente GET e assistente que é POST.

| Rota | Campos de POST / dados |
|---|---|
| `/financeiro/` | `tipo` (`RECEITA`, `DESPESA`, `COMPRA`), `titulo`, `valor`, `data` opcional, `categoria`, `observacao`. GET lista até 200 e totais do mês atual. |
| `/safras/` | `cultura` (café), `ano_safra`, `area_hectares`, `variedade`, datas opcionais, `status`, lista `talhoes`, `observacao`. |
| `/servicos/` | `nome`, `tipo` (`CONTRATADO`/`PRESTADO`), data, pessoa/local/quantidade/valor/status/observação opcionais. |
| `/equipamentos/` | `nome`, `tipo`, `identificacao`, `horimetro`, `status`, datas de manutenção e observação. |
| `/registros/` | `titulo`, data, `descricao`, `categoria`, `status`, `talhao_id` opcional; cria evento simples do calendário. |
| `/relatorios/` | GET retorna resumo mensal financeiro, movimentos recentes, estoque baixo, serviços pendentes e equipamentos em manutenção. |
| `/assistente/` | `{"message":"..."}`, `{"action":"confirm"}` ou `{"action":"cancel"}`. |

### Contrato comum e status HTTP

- Sucesso de criação normalmente usa `201`; leitura/atualização usa `200`.
- `400`: JSON inválido, campo ausente/inválido ou regra de negócio violada.
- `401`: sessão não autenticada.
- `403`: sem permissão para operação/fazenda.
- `404`: entidade não encontrada ou fora da fazenda ativa.
- `409`: conflito de estado, por exemplo vínculo já existente ou saldo que
  mudou durante confirmação.
- `502`/`503`/`504`: erro do provedor externo, integração não configurada ou
  timeout.
- Respostas de erro do próprio GoldCrop em geral trazem `ok: false` e
  `message`; erros de formulário podem também ter `field_errors`.

## 10. Serviços externos e dependências de interface

| Serviço | Uso | Indisponibilidade/limite |
|---|---|---|
| Open-Meteo | Previsão consultada pelo frontend para coordenadas do talhão | Sem coordenadas, previsão ou campos necessários, o sistema informa espera/insuficiência. |
| OpenRouter | Respostas gerais do assistente não atendidas por consultas locais | Requer chave no servidor; timeout de 25 segundos; erros são devolvidos ao cliente como 502/503/504. |
| ViaCEP | Busca de endereço durante cadastro, no navegador | Falha não substitui validação dos campos pelo servidor. |
| Leaflet/OpenStreetMap | Mapa e tiles | Dependem do browser e de rede/serviço de tiles. |
| SpeechRecognition | Ditado opcional no assistente | Depende de suporte e permissão do navegador/microfone. |
| SMTP | Redefinição de senha | Sem host/remetente configurados, endpoint retorna indisponibilidade 503. |

## 11. Migrações, build e administração

- Migrations versionadas estão em `dashboard/migrations/`,
  `gestao/migrations/` e `pecuaria/migrations/` (histórico legado preservado).
- Para aplicar no desenvolvimento: `python manage.py migrate`.
- Para criar mudanças de modelo: `python manage.py makemigrations`, revisar os
  arquivos produzidos e aplicar com `migrate`.
- `python build.py` executa `check --deploy`, verifica migrações pendentes e
  aplica migrações apenas em Vercel production.
- O Admin Django é registrado pelos arquivos `*/admin.py`; `AcessoSistema`
  tem visualização somente leitura.
- Não altere a base de produção manualmente sem backup e sem revisar migrations.

## 12. Diagnóstico de problemas comuns

### Assistente diz “OpenRouter não configurado”

Confirme `OPENROUTER_API_KEY` no ambiente do **projeto Vercel** (não apenas na
aba compartilhada da equipe), com o ambiente `Production` selecionado. Salve e
faça um novo deploy. Não inclua a chave em código nem a envie em mensagens.
Consultas locais de estoque/financeiro ainda podem funcionar sem OpenRouter.

### API responde 401 ou redireciona para login

Autentique-se no sistema no mesmo navegador e confirme que a sessão/cookies
estão ativos. Para escritas, verifique se o frontend envia o token CSRF
apropriado.

### API responde 403

Confirme fazenda ativa e vínculo ativo do usuário. A operação também pode
exigir a permissão `view`, `manage`, `plan`, `record` ou `team`.

### Previsão ou recomendação ausente

Confirme que o talhão pertence à fazenda ativa, possui latitude/longitude
válidas e tem coleta recente. A triagem fitossanitária rejeita previsão com
mais de 12 horas, fuso inválido, horários passados ou campos horários
necessários ausentes.

### Cadastro de senha não envia e-mail de redefinição

Verifique host/porta/credenciais SMTP, `DEFAULT_FROM_EMAIL` e que TLS/SSL não
estejam ambos ligados. Confira os logs do provedor SMTP e do deploy.

### Deploy Vercel falha no build

Confira `SECRET_KEY`, URL do PostgreSQL, `VERCEL_ENV`, `DEBUG` desligado e
flags HTTPS/cookies/HSTS. Examine o log do build; `build.py` também acusa
migrações não geradas ou configurações `check --deploy`.

## 13. Limitações conhecidas e interpretação de dados

- Sensores têm modelos (`SensorIoT`/`LeituraSensorIoT`), porém o módulo de
  telemetria está bloqueado e não há fluxo público de ingestão de leituras.
- `ResultadoJanela` e `ParametroTecnicoOperacao` existem como estruturas de
  dados; a presença do modelo não significa que haja interface operacional
  para todo o ciclo.
- Algumas safras/serviços/equipamentos/registros são cadastros e listagens
  básicos; não se deve pressupor recursos de edição/exclusão não expostos nas
  rotas.
- A Janela de Adubação utiliza critérios e configurações descritos em
  `LOGICA_IEA.txt`; não é um cálculo de necessidade hídrica geral.
- A triagem fitossanitária e os limites gerais do GoldCrop não substituem bula,
  avaliação presencial nem orientação profissional.
- Métricas do dashboard são derivadas dos registros persistidos e dos filtros
  descritos; períodos vazios podem produzir zero ou `insufficient_data`.
- As configurações de produção são intencionalmente rígidas. Não enfraqueça
  HTTPS, hosts ou proteção de sessão para contornar um deploy mal configurado.

## 14. Guias técnicos complementares

- [FUNCIONALIDADES_DO_SISTEMA.txt](./FUNCIONALIDADES_DO_SISTEMA.txt): resumo
  funcional para usuários.
- [LOGICA_IEA.txt](./LOGICA_IEA.txt): fatores, pesos, confiança, riscos e
  decisão da Janela de Adubação.
- [JANELA_FITOSSANITARIA.txt](./JANELA_FITOSSANITARIA.txt): origem dos dados e
  critérios da triagem meteorológica.
- [LOGICA_TALHOES.txt](./LOGICA_TALHOES.txt): cadastro, mapa, seleção e
  persistência por talhão.
- [DESIGN_RESPONSIVO_TALHOES.txt](./DESIGN_RESPONSIVO_TALHOES.txt): layout
  móvel da tela de talhões.
- [MODULO_ESTOQUE.txt](./MODULO_ESTOQUE.txt): telas, API, saldos e relatórios.
- [OPENROUTER_SETUP.txt](./OPENROUTER_SETUP.txt): configuração segura do
  assistente OpenRouter.

## 15. Manutenção da documentação

Ao alterar uma rota, regra, modelo, variável de ambiente ou integração:

1. Atualize este documento e o guia técnico específico do módulo, se aplicável.
2. Confirme a implementação e as permissões no backend, não somente o texto da
   interface.
3. Atualize ou crie testes focados na nova regra.
4. Rode `python manage.py check`, `python manage.py test` e, quando a mudança
   afetar frontend, `node --test tests/*.test.js`.
5. Nunca registre valores de segredo reais em documentação, screenshots,
   fixtures ou histórico Git.
