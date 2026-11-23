import{ac as L,ad as H,ae as V,af as W,J as Z,ag as J}from"./app.js";import{t as j,d as X,b as ee,S as ie,c as oe}from"./app-engine.js";const q=864e5,M=(l,c)=>new Promise(n=>{const d=l.subscribe(c,h=>{n(h),setTimeout(()=>d())},()=>n([]))}),I=(l,c)=>l+Math.random()*(c-l),te=`Yourv€$t parla come un amico competente: chiaro, calmo, mai paternalista.
Spieghiamo come funziona una cosa, non cosa fare con i propri soldi.
Ogni numero è un esempio ipotetico con le ipotesi scritte accanto.
Quando si parla di fisco si cita la norma e si chiude con «Informazione generale, non consulenza fiscale.»`,ne=["Frasi brevi e parole semplici","Spiegare il meccanismo con un esempio ipotetico dichiarato","Citare la norma o la fonte quando si parla di fisco","Una sola call to action per contenuto"],ae=["Dire cosa comprare o vendere","Promettere o prevedere rendimenti","Nominare concorrenti","Usare numeri senza ipotesi e fonte"],se=[["ig","instagram","@yourvest.it"],["th","threads","@yourvest.it"],["li","linkedin","yourvest"],["tt","tiktok","@yourvest.it"],["fb","facebook","yourvest.it"]],le=[["Il peso dei costi","#d97706",-44,-16,"Far provare il calcolatore dei costi a chi investe in fondi ed ETF, partendo da un esempio ipotetico su 30 anni.",8],["Lancio beta su invito","#2459d1",-12,18,"Portare 300 persone nella lista d’attesa della beta prima dell’apertura.",12],["Zainetto fiscale: le scadenze","#16a34a",9,40,"Spiegare quando scadono le minusvalenze e far usare il calcolatore gratuito sul sito.",10]],re=[["scadenza","square","scuro","Avviso · Scadenza minusvalenze","Avviso: il 31 dicembre scadono le minusvalenze più vecchie"],["numero","portrait","colore","Numero · Il peso dei costi","Esempio ipotetico: 14.200 € in meno su 30 anni con costi dell’1% all’anno"],["confronto","square","chiaro","Confronto · Con e senza costi","Esempio ipotetico: 10.000 € dopo 30 anni, con e senza costi"],["lista","portrait","scuro","Tre punti · Minusvalenze","Tre cose da sapere sulle minusvalenze"],["countdown","story","scuro","Conto alla rovescia · 31 dicembre","Giorni che mancano alla scadenza delle minusvalenze"],["sondaggio","square","chiaro","Sondaggio · Quanti broker","Sondaggio: quanti broker usi oggi?"]],ce=[["area","Grafico · Andamento (esempio)","Grafico di esempio ipotetico: andamento di un portafoglio nel tempo"],["donut","Grafico · Allocazione (esempio)","Grafico di esempio ipotetico: investimenti divisi tra azioni, ETF, crypto e liquidità"]];function de(l,c){const n=c.colors,d=document.createElement("canvas"),h=d.width=l==="area"?1200:1080,p=d.height=l==="area"?675:1350,e=d.getContext("2d"),g=e.createLinearGradient(0,0,h,p);if(g.addColorStop(0,n.main),g.addColorStop(1,n.background),e.fillStyle=g,e.fillRect(0,0,h,p),e.fillStyle=n.text,e.font=`800 56px "${c.fonts.headline}", system-ui, sans-serif`,e.fillText(l==="area"?"Andamento del portafoglio":"Dove sono i tuoi investimenti",70,120),e.fillStyle=n.neutral,e.font=`500 28px "${c.fonts.text}", system-ui, sans-serif`,e.fillText("Esempio ipotetico · Yourv€$t",70,p-60),l==="area"){const S=f=>70+f*(h-140)/23,m=p-130,v=f=>m-(.25+.5*(f/23)+.08*Math.sin(f*1.3)+.04*Math.sin(f*2.9))*(p-330);e.beginPath();for(let f=0;f<24;f++)e.lineTo(S(f),v(f));e.strokeStyle=n.accent,e.lineWidth=7,e.lineJoin="round",e.stroke(),e.lineTo(S(23),m),e.lineTo(S(0),m),e.closePath(),e.globalAlpha=.18,e.fillStyle=n.accent,e.fill(),e.globalAlpha=1}else{const S=[["Azioni",.38,n.accent],["ETF",.34,n.highlight],["Liquidità",.16,n.neutral],["Crypto",.12,n.text]];let m=-Math.PI/2;S.forEach(([v,f,A],k)=>{e.beginPath(),e.arc(h/2,560,270,m+.03,(m+=f*2*Math.PI)-.03),e.strokeStyle=A,e.lineWidth=96,e.stroke(),e.fillStyle=A,e.fillRect(110,962+k*68,30,30),e.fillStyle=n.text,e.font=`600 36px "${c.fonts.text}", system-ui, sans-serif`,e.fillText(v,164,990+k*68)})}return d}const y="Informazione generale, non consulenza fiscale.",ue=[{d:-30,t:"12:30",st:"published",n:"ig fb",p:"educazione",c:0,m:[1],x:`Quanto pesano i costi sui tuoi investimenti?

L’1% all’anno sembra poco. Su 30 anni non lo è.

Esempio ipotetico: 10.000 € al 6% lordo annuo. Con costi dell’1% all’anno arrivi a circa 43.200 € invece di 57.400 €.

Fai il conto con i tuoi numeri: calcolatore gratuito, link in bio.

#investimenti #costi #finanzapersonale`},{d:-28,t:"18:30",st:"published",n:"th li",p:"educazione",c:0,x:`TER, commissioni di gestione, costi di ingresso.

Tre voci diverse, un solo effetto: riducono quello che resta a te.

Dove trovarle? Nel KID del prodotto, alla voce «costi nel tempo». Due minuti di lettura prima di investire.`},{d:-27,t:"12:30",st:"published",n:"ig tt",p:"educazione",c:0,m:[2],x:`10.000 € dopo 30 anni: con e senza costi.

Stesso mercato, stesso rendimento lordo. Cambia solo quanto paghi ogni anno.

(Esempio ipotetico: 6% lordo annuo, costi dell’1% all’anno. Nessuna previsione, solo aritmetica.)

Salva il post per quando leggi un KID.

#etf #fondi #costi`},{d:-25,t:"08:00",st:"published",n:"li",p:"prodotto",l:!0,x:`Perché stiamo costruendo Yourv€$t.

Chi investe in Italia ha spesso due o tre broker, un piano previdenziale e un po’ di liquidità sparsa. Per avere il quadro completo servono fogli di calcolo e molta pazienza.

Vogliamo che basti uno sguardo: tutti gli investimenti in un posto solo, con le scadenze e i prospetti italiani già pronti.

La beta è su invito. La lista d’attesa è nel link.`},{d:-23,t:"18:30",st:"published",n:"th fb",p:"community",x:`Quanti broker usi oggi?

A) Uno solo
B) Due o più

Scrivilo nei commenti: ci serve per capire cosa costruire prima.`},{d:-22,t:"12:30",st:"published",n:"li th",p:"educazione",c:0,x:`Mito: «I costi li vedo sull’estratto conto».

Realtà: molti costi sono già dentro il prezzo del fondo. Non compaiono come addebito, li paghi come rendimento in meno.

Per questo conta leggere il KID, non solo i movimenti.`},{d:-20,t:"18:30",st:"published",n:"ig tt",p:"fisco",m:[3],x:`Minusvalenze: 3 cose da sapere.

1. Si usano fino al 31 dicembre del quarto anno successivo.
2. Valgono contro azioni, obbligazioni e certificati.
3. Non valgono contro i guadagni di ETF e fondi.

Salva il post per fine anno.

${y}

#minusvalenze #zainettofiscale #investimenti`},{d:-19,t:"12:30",st:"published",n:"th",p:"community",x:`Domanda seria: dove tieni traccia dei tuoi investimenti?

Foglio di calcolo, app del broker, memoria?

Raccontacelo: stiamo raccogliendo le abitudini di chi investe in Italia.`},{d:-17,t:"12:30",st:"published",n:"ig fb li",p:"educazione",c:0,m:[1],x:`Checklist prima di scegliere un fondo.

1. Leggi i costi correnti nel KID
2. Controlla se ci sono costi di ingresso o di uscita
3. Guarda l’orizzonte temporale indicato
4. Confronta con un prodotto simile
5. Fai il conto sul lungo periodo

Per l’ultimo punto c’è il calcolatore gratuito su yourvest.it

#fondi #etf #finanzapersonale`},{d:-16,t:"18:30",st:"published",n:"ig",p:"prodotto",c:0,m:[7],x:`Azioni su un broker, ETF su un altro, crypto su un exchange, liquidità in banca.

Il totale lo sai?

Su Yourv€$t li vedi insieme, divisi per tipo. La grafica è un esempio ipotetico: i numeri veri sono i tuoi.

Beta su invito: link in bio.`},{d:-14,t:"12:30",st:"published",n:"li th",p:"educazione",x:`Il fondo pensione non è solo «per la pensione».

I contributi versati si possono dedurre dal reddito entro un limite annuo fissato dalla legge.

Quanto conta per te dipende dalla tua situazione: il simulatore della previdenza su yourvest.it mostra il meccanismo.

${y}`},{d:-12,t:"18:30",st:"published",n:"ig th fb li",p:"prodotto",c:1,m:[6,7],x:`Apriamo la lista d’attesa della beta.

Yourv€$t mette tutti i tuoi investimenti in un posto solo: azioni, ETF, crypto e liquidità, da ogni broker.

Entriamo a piccoli gruppi, per ascoltare chi la usa.

Le grafiche sono esempi ipotetici.`,v:{threads:`La lista d’attesa della beta è aperta.

Tutti i tuoi investimenti in un posto solo, da ogni broker. Entriamo a piccoli gruppi, per ascoltare chi la usa.`},l:!0},{d:-10,t:"12:30",st:"published",n:"ig tt",p:"prodotto",c:1,m:[6],x:`Com’è andato il tuo portafoglio quest’anno?

Se per rispondere devi aprire tre app, non sei solo.

Con Yourv€$t lo vedi in un grafico unico. Quello nell’immagine è un esempio ipotetico: niente previsioni, solo i tuoi dati messi in ordine.

Beta su invito, link in bio.

#portafoglio #investimenti`},{d:-9,t:"18:30",st:"published",n:"th",p:"community",c:1,x:`Cosa vorresti vedere per prima cosa quando apri un’app per i tuoi investimenti?

Totale, andamento, scadenze, altro?

Le risposte finiscono dritte nella lista delle cose da costruire.`},{d:-7,t:"12:30",st:"published",n:"ig li fb",p:"fisco",m:[0],x:`Le minusvalenze hanno una scadenza.

Le perdite realizzate si possono usare per compensare guadagni futuri, ma solo fino al 31 dicembre del quarto anno successivo.

Dopo quella data si perdono.

Controlla le tue con il calcolatore gratuito su yourvest.it

${y}

#minusvalenze #zainettofiscale`},{d:-6,t:"18:30",st:"published",n:"li th",p:"prodotto",c:1,x:`Tre cose che la beta fa già.

1. Unisce i conti di più broker
2. Mostra il totale per tipo di investimento
3. Tiene il calendario delle scadenze

Tre cose in arrivo: prospetti di fine anno, previdenza, più broker collegati.

Lista d’attesa su yourvest.it`},{d:-4,t:"12:30",st:"published",n:"fb li th",p:"educazione",x:`ETF ad accumulazione o a distribuzione?

Accumulazione: i proventi restano dentro il fondo e vengono reinvestiti.
Distribuzione: i proventi ti arrivano sul conto.

Non ce n’è uno migliore in assoluto: dipende da cosa ti serve e da quando.`},{d:-3,t:"18:30",st:"published",n:"ig tt",p:"community",c:1,m:[5],nm:!0,x:`Sondaggio veloce.

Un solo broker o più di uno?

A o B nei commenti: ci aiuta a decidere cosa costruire prima.`},{d:-1,t:"12:30",st:"published",n:"li fb",p:"prodotto",c:1,nm:!0,l:!0,x:`Aggiornamento dalla beta.

Questa settimana abbiamo lavorato su una cosa sola: importare i movimenti da un file del broker senza doverli ritoccare a mano.

È la parte meno visibile e quella che fa risparmiare più tempo.

Se vuoi provarla tra i primi, la lista d’attesa è nel link.`},{d:-2/24,st:"scheduled",n:"ig th",p:"fisco",m:[4],x:`Quanti giorni mancano al 31 dicembre?

È la data in cui scadono le minusvalenze più vecchie del tuo zainetto fiscale: quelle del quarto anno precedente.

Nelle storie trovi il conto alla rovescia.

${y}`},{d:1,t:"12:30",st:"scheduled",n:"li th fb",p:"educazione",x:`PAC: cos’è e come funziona.

Un piano di accumulo è un versamento periodico, sempre uguale, nello stesso strumento.

1. Scegli l’importo
2. Scegli la frequenza
3. Lasci lavorare il tempo

Non elimina il rischio: lo distribuisce nel tempo.`},{d:2,t:"18:30",st:"scheduled",n:"ig tt",p:"prodotto",c:1,m:[7],x:`Un posto solo per tutto.

Azioni, ETF, crypto, liquidità: ogni cosa nel suo colore, il totale in alto.

(La grafica è un esempio ipotetico.)

La beta è su invito: link in bio.

#portafoglio #investimenti`},{d:4,t:"12:30",st:"scheduled",n:"ig fb li",p:"fisco",m:[3],x:`Zainetto fiscale: cos’è?

È il nome con cui si indicano le minusvalenze accumulate e non ancora usate.

Ogni perdita ha la sua data di scadenza. Ricordarle tutte a memoria è difficile: per questo le mettiamo in calendario.

${y}

#zainettofiscale #minusvalenze`},{d:6,t:"18:30",st:"scheduled",n:"th",p:"community",c:1,x:`Venerdì rispondiamo alle domande sulla beta.

Scrivile qui sotto: funzioni, broker supportati, tempi. Rispondiamo a tutte, anche a quelle scomode.`},{d:9,t:"12:30",st:"scheduled",n:"ig th fb li",p:"fisco",c:2,m:[0],x:`Da oggi parliamo di scadenze.

Per qualche settimana spieghiamo come funzionano le minusvalenze: quando nascono, contro cosa si usano, quando si perdono.

Si parte dalla data che conta: il 31 dicembre.

${y}`},{d:11,t:"18:30",st:"scheduled",n:"ig tt",p:"fisco",c:2,m:[4],x:`Ogni anno, il 31 dicembre, una parte delle minusvalenze scade.

Il calcolatore gratuito su yourvest.it ti mostra quali sono le tue e quando scadono.

Nelle storie trovi il conto alla rovescia.

${y}

#minusvalenze #scadenze`},{d:13,t:"12:30",st:"scheduled",n:"li",p:"educazione",x:`Rischio e volatilità non sono la stessa cosa.

La volatilità misura quanto oscilla un prezzo. Il rischio è non avere i soldi quando ti servono.

Un investimento può oscillare molto ed essere adatto a un obiettivo lontano, oppure oscillare poco ed essere inadatto a uno vicino.

Prima l’orizzonte, poi lo strumento.`},{d:3,t:"12:30",st:"review",n:"li th fb",p:"educazione",x:`Interesse composto, spiegato semplice.

Gli interessi di un anno producono a loro volta interessi l’anno dopo.

Esempio ipotetico: 5.000 € al 5% annuo diventano circa 8.100 € in 10 anni e circa 13.300 € in 20, senza aggiungere nulla.

Il tempo conta più dell’importo.`,k:["Aggiungerei che il 5% è lordo e che non è una previsione."]},{d:5,t:"18:30",st:"review",n:"ig tt",p:"prodotto",c:1,m:[6],x:`Dietro le quinte della beta.

Matteo mostra in 30 secondi come si importa un file del broker.

Nessun trucco: carichi, controlli, confermi.

Il video è in arrivo. Intanto la lista d’attesa è nel link in bio.`,k:["Manca la copertina del reel: la prepariamo in Modelli?","Girato previsto per giovedì, poi aggiorno il testo."]},{d:10,t:"12:30",st:"review",n:"th li",p:"community",c:2,x:`Qual è la cosa che rimandi sempre quando si parla di investimenti?

Controllare i costi, mettere ordine tra i conti, guardare le scadenze?

Diccelo: la prossima serie di post parte da lì.`},{d:0,st:"draft",n:"li",p:"educazione",x:`Obbligazioni: cedola, scadenza, prezzo.

Tre parole per capire come funziona un titolo di Stato.

(Da completare: un esempio ipotetico con numeri tondi.)`,k:["Rimandato in bozza: il titolo promette troppo, riscriviamolo come domanda."]},{d:0,st:"draft",n:"li",p:"prodotto",c:1,x:`Cosa abbiamo imparato dalle prime settimane di beta.

(Da scrivere dopo la riunione di venerdì: tre punti, uno per riga.)`},{d:0,st:"draft",n:"th",p:"educazione",x:`Glossario in una riga: lo spread denaro-lettera.

È la differenza tra il prezzo di acquisto e quello di vendita di uno strumento nello stesso momento. Più è ampia, più costa entrare e uscire.`},{d:0,st:"draft",n:"ig fb",p:"fisco",c:2,m:[0],x:`Minusvalenze ed ETF: l’errore più comune.

Molti pensano di poter usare le perdite per compensare i guadagni di un ETF. Non funziona così: quei guadagni sono redditi di capitale, le minusvalenze compensano solo i redditi diversi.

${y}`},{d:-5,t:"18:30",st:"stopped",n:"ig th",p:"community",m:[5],x:`Tema chiaro o tema scuro?

Stiamo scegliendo l’aspetto della beta e vogliamo il tuo parere.

A) Chiaro
B) Scuro`,k:["Fermato: aspettiamo le nuove schermate prima di chiedere."]}],pe=[["https://www.agenziaentrate.gov.it","Scadenze fiscali di fine anno","Verificare le date ufficiali prima di ogni post sulle scadenze."],["","Serie «Glossario in una riga»","Un termine a settimana su Threads: spread, TER, duration, cedola."],["","Reel: importare un file del broker in 30 secondi","Girare con la beta vera e oscurare gli importi. Niente dati inventati."],["https://www.covip.it","Relazione annuale COVIP sulla previdenza complementare","Solo dati citabili con fonte e anno. Niente confronti di rendimento."],["https://www.consob.it","Educazione finanziaria Consob: i costi dei prodotti","Spunto per il carosello «come leggere un KID».",!0],["","Domande ricorrenti sulla beta","Raccogliere le domande dai commenti e farne un post al mese."],["https://www.borsaitaliana.it","Glossario di Borsa Italiana","Fonte per le definizioni: riscrivere sempre con parole nostre."],["https://economiapertutti.bancaditalia.it","Economia per tutti: l’interesse composto","Base per lo spiegone sull’interesse composto.",!0],["https://www.quellocheconta.gov.it","Portale pubblico di educazione finanziaria","Guide su previdenza e investimenti: buoni spunti per i caroselli."],["https://yourvest.it","Calcolatore del peso dei costi","Ogni post della campagna sui costi rimanda qui.",!0]],me=[["Minusvalenze: quando scadono","ready",[["Le perdite sui tuoi investimenti hanno una data di scadenza. E quasi nessuno la controlla.","Hanno una scadenza","Matteo in primo piano, guarda in camera"],["Una minusvalenza si può usare per compensare guadagni futuri fino al 31 dicembre del quarto anno successivo.","31 dicembre, quarto anno","Calendario a schermo con la data evidenziata"],["Attenzione: vale contro azioni, obbligazioni e certificati. Non contro i guadagni di ETF e fondi.","Non contro ETF e fondi","Due colonne: sì e no"],["Sul sito c’è un calcolatore gratuito che ti dice quali sono le tue. Informazione generale, non consulenza fiscale.","Calcolatore gratuito","Schermata del calcolatore su yourvest.it"]]],["Quanto pesano i costi in 30 anni","script",[["L’uno per cento all’anno sembra niente. Facciamo il conto.","Solo l’1%?","Matteo alla scrivania"],["Esempio ipotetico: diecimila euro al sei per cento lordo per trent’anni. Senza costi, circa cinquantasettemila.","Esempio ipotetico","Grafica «Confronto» dalla libreria"],["Con costi dell’uno per cento all’anno, circa quarantatremila. La differenza è tutta lì.","Stesso mercato, meno a te","Le due barre a confronto"]]],["Importare un file del broker in 30 secondi","idea",[["Carichi il file, controlli le righe, confermi. Fine.","Tre passaggi","Registrazione dello schermo della beta, importi oscurati"]]]];let Q=null;function he(l){return Q??(Q=ge(l).finally(()=>{Q=null}))}async function ge(l){var P,N,O,R,U,G;const c=Date.now(),n=l.me.id,d=(o,i)=>{if(!i)return new Date(c+o*q).toISOString();const t=new Date(c);t.setDate(t.getDate()+o);const[a,s]=i.split(":").map(Number);return t.setHours(a,s,0,0),t.toISOString()},h=o=>J(d(o)).slice(0,10),p=(o,i)=>l.put(o,i.id,i),e=(await M(l,"brands")).sort((o,i)=>(o.createdAt||"").localeCompare(i.createdAt||""))[0],g=(e==null?void 0:e.id)||"yourvest",S=o=>!o.brandId||o.brandId===g;if((await M(l,"posts")).some(S))return;const m={...L,...e==null?void 0:e.kit,colors:{...L.colors,...(P=e==null?void 0:e.kit)==null?void 0:P.colors},fonts:{...L.fonts,...(N=e==null?void 0:e.kit)==null?void 0:N.fonts}},v={name:"Yourv€$t",handle:"@yourvest.it",site:"yourvest.it",createdAt:d(-32),...e,id:g,kit:{...m,rules:m.rules||te,voiceDo:(O=m.voiceDo)!=null&&O.length?m.voiceDo:ne,voiceDont:(R=m.voiceDont)!=null&&R.length?m.voiceDont:ae,filledBy:m.filledBy||"Dati di esempio",filledAt:m.filledAt||d(-31)},goal:(e==null?void 0:e.goal)||20,pillars:(U=e==null?void 0:e.pillars)!=null&&U.length?e.pillars:W,snippets:(e==null?void 0:e.snippets)??V,slots:(e==null?void 0:e.slots)??H};await p("brands",v);const f=(await M(l,"accounts")).filter(S),A={};for(const[o,i,t]of se){const a=((G=f.find(s=>s.network===i))==null?void 0:G.id)||"demo-acc-"+o;A[o]={id:a,network:i},a.startsWith("demo-")&&await p("accounts",{id:a,brandId:g,network:i,name:v.name,handle:t,createdAt:d(-31)})}const k=le.map(([o,i,t,a,s,u],r)=>({id:"demo-camp-"+(r+1),brandId:g,name:o,color:i,start:h(t),end:h(a),goal:s,target:u,utm:["peso_dei_costi","beta_invito","zainetto_scadenze"][r],createdAt:d(t-3),author:n}));for(const o of k)await p("campaigns",o);const T=new Date(c).getFullYear(),Y={scadenza:{data:`31 dicembre ${T}`,titolo:`Ultimo giorno per usare le *perdite del ${T-4}*`},countdown:{giorni:String(Math.max(1,Math.ceil((new Date(T,11,31).getTime()-c)/q))),titolo:`alla scadenza delle *minusvalenze del ${T-4}*`}},F=[],E=[],$=async(o,i,t,a)=>{const s=await l.upload(await oe(o),"image/png"),u=E.length,r={id:"demo-media-"+(u+1),brandId:g,assetId:s.id,kind:"image",name:i,alt:t,source:a,size:`${o.width}×${o.height}`,createdAt:d(-31+u*3),author:n};return F.push({assetId:s.id,alt:t}),E.push(r),await p("media",r),r};for(const[o,i,t,a,s]of re){const u=j(o),r=X(u,i,t);Object.assign(r.fields,Y[o]);const{canvas:x}=await ee(u,r,v.kit,v.name,l.assetUrl),b=await $(x,`${a} · ${ie[i].label}`,s,"template");await p("designs",{id:"demo-design-"+E.length,brandId:g,name:a,design:r,assetId:b.assetId,createdAt:b.createdAt,updatedAt:b.createdAt,author:n})}for(const[o,i,t]of ce)await $(de(o,v.kit),i,t,"upload");const w=[[new Date(c).toISOString(),"ha caricato i dati di esempio",v.name]];E.forEach(o=>w.push([o.createdAt,"ha aggiunto alla libreria",o.name]));for(const[o,i]of ue.entries()){const t=i.st==="draft"?null:d(i.d,i.t),a=new Date(Math.min(c-q,t?new Date(t).getTime()-3*q:c-(o%5+1)*q)).toISOString(),s=i.st==="published",u=i.n.split(" ").map(z=>A[z]),r=i.c==null?null:k[i.c],x=(i.m||[]).map(z=>F[z]),b=Math.round(I(600,1900)*(1+(30+i.d)/45)*(x.length?1.3:.75)),_=i.p==="educazione"||i.p==="fisco"?1.6:1,K={reach:b,likes:Math.round(b*I(.035,.06)),comments:Math.round(b*I(.004,.012)),saves:Math.round(b*I(.01,.025)*_),shares:Math.round(b*I(.004,.012)),at:new Date(Math.min(c,new Date(t||c).getTime()+2*q)).toISOString()},C={num:100+o+1,id:"demo-post-"+String(o+1).padStart(2,"0"),brandId:g,text:i.x,variants:i.v||{},link:i.l?"https://yourvest.it":"",accounts:u.map(z=>z.id),media:x,status:i.st,when:t,author:n,createdAt:a,updatedAt:s?t:a,publishedAt:s?t:null,...s&&!i.nm?{metrics:K}:{},campaignId:(r==null?void 0:r.id)??null,pillar:i.p,utm:(r==null?void 0:r.utm)||"studio",approval:s||i.st==="scheduled"?{by:n,at:a}:null,comments:(i.k||[]).map((z,B)=>({id:`demo-note-${o}-${B}`,who:n,at:d(-1-B),text:z}))};await p("posts",C);const D=Z(i.x);s?(w.push([t,"ha segnato come pubblicato",D]),C.metrics&&w.push([C.metrics.at,"ha aggiornato i numeri di",D])):i.st==="scheduled"?w.push([a,"ha programmato un post",D]):i.st==="review"&&w.push([a,"ha inviato in approvazione",D]),C.comments.forEach(z=>w.push([z.at,"ha commentato",D]))}for(const[o,[i,t,a,s]]of pe.entries()){const u={id:"demo-idea-"+(o+1),brandId:g,url:i,title:t,note:a,status:s?"used":"new",createdAt:d(-2-o*3),author:n};await p("ideas",u),w.push([u.createdAt,"ha salvato l’idea",t])}for(const[o,[i,t,a]]of me.entries()){const s={id:"demo-reel-"+(o+1),brandId:g,title:i,status:t,beats:a.map(([u,r,x])=>({text:u,screen:r,visual:x})),createdAt:d(-8-o*4),updatedAt:d(-2-o*3),author:n};await p("reels",s)}for(const[o,[i,t,a]]of w.sort((s,u)=>u[0].localeCompare(s[0])).slice(0,25).entries())await p("activity",{id:"demo-act-"+(o+1),brandId:g,at:i,who:n,action:t,target:a.slice(0,120)})}export{he as seedDemo};
