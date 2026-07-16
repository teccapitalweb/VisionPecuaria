// ═══════════════════════════════════════════════════════════
// DIAGNÓSTICO VETERINARIO · orientación por síntomas
//
// NO hay IA ni servicio externo: es una base local de 22
// enfermedades (SENASICA/INIFAP/SADER) y un cruce de síntomas.
// Cero Firestore: no lee ni escribe nada.
//
// El contenido médico (nombres, síntomas, descripciones, dosis,
// retiros, prevención, fuentes) está copiado VERBATIM del portal
// actual (index.html:14845 y :14889) con un script, no a mano:
// un error de tipeo en una dosis puede dañar a un animal.
// Si hay que corregir medicina, que lo haga un MVZ.
//
// Tres diferencias con el viejo, todas de presentación:
//  1. El viejo pinta "${score}% probabilidad". Ese número NO es una
//     probabilidad: es (recall*0.6 + precision*0.4)*100, un solapamiento
//     de listas con pesos elegidos a ojo — sin prevalencia, sin
//     verosimilitudes, sin priors. Presentarlo como porcentaje induce
//     a medicar sin veterinario. El score se sigue usando para ORDENAR,
//     pero se muestra la coincidencia real: "4 de 5 síntomas".
//  2. El disclaimer del MVZ va ARRIBA, antes de cualquier dosis.
//  3. Cada tratamiento lleva pegada su advertencia de automedicación.
// ═══════════════════════════════════════════════════════════

// ── Catálogo de síntomas — verbatim de index.html:14845 ──
const SINTOMAS_CATALOGO = [
  // Generales
  { id: 'fiebre', label: 'Fiebre / temperatura alta', emoji: '🌡️', categoria: 'general' },
  { id: 'apatia', label: 'Apatía / depresión', emoji: '😴', categoria: 'general' },
  { id: 'noCome', label: 'No come (anorexia)', emoji: '🚫', categoria: 'general' },
  { id: 'perdidaPeso', label: 'Pérdida de peso', emoji: '📉', categoria: 'general' },
  { id: 'debilidad', label: 'Debilidad general', emoji: '😩', categoria: 'general' },
  { id: 'deshidratacion', label: 'Deshidratación', emoji: '💧', categoria: 'general' },
  // Digestivos
  { id: 'diarrea', label: 'Diarrea', emoji: '💩', categoria: 'digestivo' },
  { id: 'diarreaSangre', label: 'Diarrea con sangre', emoji: '🩸', categoria: 'digestivo' },
  { id: 'noRumia', label: 'No rumia', emoji: '🤐', categoria: 'digestivo' },
  { id: 'timpanismo', label: 'Vientre inflamado (timpanismo)', emoji: '🎈', categoria: 'digestivo' },
  { id: 'vomito', label: 'Vómito', emoji: '🤢', categoria: 'digestivo' },
  // Respiratorios
  { id: 'tos', label: 'Tos', emoji: '😷', categoria: 'respiratorio' },
  { id: 'dificultadRespirar', label: 'Dificultad para respirar', emoji: '😮‍💨', categoria: 'respiratorio' },
  { id: 'secrecionNasal', label: 'Secreción nasal', emoji: '🤧', categoria: 'respiratorio' },
  { id: 'respiracionRapida', label: 'Respiración rápida', emoji: '💨', categoria: 'respiratorio' },
  // Locomoción
  { id: 'cojera', label: 'Cojera', emoji: '🦵', categoria: 'locomocion' },
  { id: 'temblores', label: 'Temblores musculares', emoji: '〰️', categoria: 'locomocion' },
  { id: 'paralisis', label: 'Parálisis', emoji: '⛔', categoria: 'locomocion' },
  { id: 'caidas', label: 'Se cae / no se levanta', emoji: '⬇️', categoria: 'locomocion' },
  // Piel y mucosas
  { id: 'palidez', label: 'Encías pálidas (anemia)', emoji: '🤍', categoria: 'piel' },
  { id: 'ictericia', label: 'Mucosas amarillas (ictericia)', emoji: '🟡', categoria: 'piel' },
  { id: 'hinchazon', label: 'Hinchazón en piel', emoji: '🎈', categoria: 'piel' },
  { id: 'heridas', label: 'Heridas / lesiones', emoji: '🩹', categoria: 'piel' },
  { id: 'caidaPelo', label: 'Caída de pelo / dermatitis', emoji: '🪒', categoria: 'piel' },
  // Reproductivo / ubre
  { id: 'mastitis', label: 'Ubre inflamada / dolor', emoji: '⚠️', categoria: 'reproductivo' },
  { id: 'leche', label: 'Leche con sangre o pus', emoji: '🥛', categoria: 'reproductivo' },
  { id: 'aborto', label: 'Aborto / mortinatos', emoji: '😢', categoria: 'reproductivo' },
  { id: 'infertilidad', label: 'Infertilidad / repite celo', emoji: '🔁', categoria: 'reproductivo' },
  // Neurológicos
  { id: 'salivacion', label: 'Salivación excesiva', emoji: '💦', categoria: 'neurologico' },
  { id: 'agresividad', label: 'Agresividad / comportamiento raro', emoji: '😡', categoria: 'neurologico' },
  { id: 'convulsiones', label: 'Convulsiones', emoji: '⚡', categoria: 'neurologico' },
  // Garrapatas / parásitos
  { id: 'garrapatas', label: 'Garrapatas visibles', emoji: '🕷️', categoria: 'parasito' },
  { id: 'moscas', label: 'Moscas / heridas con larvas', emoji: '🪰', categoria: 'parasito' }
];

// ── Base de enfermedades — verbatim de index.html:14889 ──
// 22 enfermedades · 5 especies · 13 severidad alta, 8 media, 1 baja
// 7 notificables a SENASICA. NO EDITAR sin un MVZ.
const ENFERMEDADES_DB = [
  // ═══ BOVINOS ═══
  {
    id: 'mastitis',
    nombre: 'Mastitis bovina',
    especies: ['bovino'],
    severidad: 'media',
    sintomas: ['mastitis', 'leche', 'fiebre', 'apatia'],
    descripcion: 'Inflamación de la glándula mamaria por bacterias (E. coli, Staphylococcus, Streptococcus). Causa más común de pérdidas económicas en vacas lecheras.',
    tratamiento: 'Antibiótico intramamario (cefalexina, amoxicilina) por 3-5 días. Antiinflamatorio (flunixin meglumine). Vaciado completo del cuarto afectado 2-3 veces al día. RETIRO de leche durante tratamiento + 96 horas post-tratamiento.',
    prevencion: 'Higiene en ordeño: pre-dipping y post-dipping con yodo. Secado de pezones. Buen mantenimiento del equipo de ordeño. Vacuna J5 en vacas de alta producción.',
    notificable: false,
    fuente: 'SAGARPA-SENASICA · INIFAP'
  },
  {
    id: 'fiebreEmbarque',
    nombre: 'Fiebre de embarque (Complejo Respiratorio Bovino)',
    especies: ['bovino'],
    severidad: 'alta',
    sintomas: ['fiebre', 'tos', 'secrecionNasal', 'dificultadRespirar', 'apatia', 'noCome'],
    descripcion: 'Neumonía multifactorial causada por estrés del traslado + virus (BRSV, BVD, IBR) + bacterias (Mannheimia, Pasteurella). Común en becerros recién llegados a engorda.',
    tratamiento: 'Antibiótico de amplio espectro (tilmicosina, florfenicol, tulatromicina) 1-2 dosis. Antiinflamatorio. Aislar animales enfermos. Mejorar ventilación.',
    prevencion: 'Vacunación 2 semanas antes del transporte (IBR, BVD, BRSV, PI3, Mannheimia). Manejo bajo en estrés. Cuarentena 21 días al llegar.',
    notificable: false,
    fuente: 'INIFAP CENID Salud Animal'
  },
  {
    id: 'timpanismoBovino',
    nombre: 'Timpanismo (empacho)',
    especies: ['bovino', 'ovino', 'caprino'],
    severidad: 'alta',
    sintomas: ['timpanismo', 'dificultadRespirar', 'noRumia', 'apatia', 'salivacion'],
    descripcion: 'Acumulación de gases en el rumen. Puede ser espumoso (por leguminosas como alfalfa fresca) o libre (por obstrucción esofágica).',
    tratamiento: 'URGENCIA. Pasar sonda esofágica para liberar gas. En timpanismo espumoso: aceite mineral o tensoactivo (poloxaleno) oral. Si severo: trocarización del flanco izquierdo por MVZ.',
    prevencion: 'Evitar pastoreo en alfalfa o tréboles muy tiernos. Introducir granos gradualmente. Ofrecer forraje seco antes de leguminosas frescas.',
    notificable: false,
    fuente: 'SADER · Club Ganadero'
  },
  {
    id: 'anaplasmosis',
    nombre: 'Anaplasmosis bovina',
    especies: ['bovino'],
    severidad: 'alta',
    sintomas: ['fiebre', 'palidez', 'debilidad', 'ictericia', 'perdidaPeso', 'apatia', 'garrapatas'],
    descripcion: 'Enfermedad hemoparasitaria por Anaplasma marginale. Transmitida por garrapatas Boophilus microplus, moscas hematófagas y agujas contaminadas. Prevalencia >50% en regiones tropicales de México.',
    tratamiento: 'Oxitetraciclina larga acción (20 mg/kg IM, 1-3 dosis cada 3 días). Imidocarb dipropionato 3 mg/kg. Soporte: vitaminas B12, fluidos. Casos graves: transfusión sanguínea.',
    prevencion: 'Control de garrapatas con ixodicidas. Cuarentena de animales nuevos. Desinfección de agujas entre animales. Vacuna donde disponible.',
    notificable: false,
    fuente: 'INIFAP-CENID-SA · SENASICA'
  },
  {
    id: 'brucelosis',
    nombre: 'Brucelosis bovina',
    especies: ['bovino', 'ovino', 'caprino'],
    severidad: 'alta',
    sintomas: ['aborto', 'infertilidad'],
    descripcion: 'Zoonosis bacteriana (Brucella abortus en bovinos, B. melitensis en caprinos). Causa abortos en último tercio de gestación. SE TRANSMITE A HUMANOS por leche cruda y contacto con productos del parto.',
    tratamiento: 'NO HAY tratamiento curativo. SACRIFICIO obligatorio del animal positivo. Notificación a SENASICA.',
    prevencion: 'Vacunación cepa RB51 en becerras 3-8 meses. Pruebas serológicas anuales. Eliminación de positivos. Pasteurización de leche.',
    notificable: true,
    fuente: 'SENASICA · Campaña Nacional NOM-041-ZOO-1995'
  },
  {
    id: 'tuberculosis',
    nombre: 'Tuberculosis bovina',
    especies: ['bovino'],
    severidad: 'alta',
    sintomas: ['tos', 'perdidaPeso', 'debilidad', 'dificultadRespirar'],
    descripcion: 'Zoonosis bacteriana por Mycobacterium bovis. Curso crónico. Transmisión por aerosoles, leche cruda. Difícil de diagnosticar en etapas tempranas.',
    tratamiento: 'NO HAY tratamiento permitido en ganado. SACRIFICIO obligatorio. Notificación inmediata a SENASICA.',
    prevencion: 'Prueba de tuberculina anual. Eliminación de reactivos positivos. Hatos libres certificados. Pasteurización de leche.',
    notificable: true,
    fuente: 'SENASICA · Campaña Nacional NOM-031-ZOO-1995'
  },
  {
    id: 'rabia',
    nombre: 'Rabia paralítica bovina (derriengue)',
    especies: ['bovino', 'ovino', 'caprino', 'porcino'],
    severidad: 'alta',
    sintomas: ['paralisis', 'caidas', 'salivacion', 'agresividad', 'convulsiones', 'debilidad'],
    descripcion: 'Zoonosis viral mortal transmitida por mordedura de murciélago hematófago (Desmodus rotundus). 100% mortal una vez que aparecen síntomas. MUY GRAVE.',
    tratamiento: 'NO HAY tratamiento. Eutanasia humanitaria. NOTIFICACIÓN INMEDIATA a SENASICA. Protección de personal en contacto.',
    prevencion: 'Vacunación anual con vacuna inactivada en zonas endémicas. Control de murciélagos hematófagos (warfarina en gel). Refugio nocturno del ganado.',
    notificable: true,
    fuente: 'SENASICA · NOM-067-ZOO-2007'
  },
  {
    id: 'diarreaViralBovina',
    nombre: 'Diarrea viral bovina (DVB/BVD)',
    especies: ['bovino'],
    severidad: 'alta',
    sintomas: ['diarrea', 'fiebre', 'aborto', 'noCome', 'apatia'],
    descripcion: 'Viral (Pestivirus). Causa diarrea aguda, abortos, infertilidad, becerros persistentemente infectados (PI). Pérdidas económicas altas.',
    tratamiento: 'Sintomático: fluidos, electrolitos, antibióticos contra infecciones secundarias. NO existe tratamiento antiviral específico.',
    prevencion: 'Vacunación con virus modificado en hembras 30 días antes de monta. Identificación y eliminación de PIs. Cuarentena de animales nuevos.',
    notificable: false,
    fuente: 'INIFAP · SENASICA'
  },
  {
    id: 'clostridiosis',
    nombre: 'Clostridiosis (carbón sintomático / pierna negra)',
    especies: ['bovino', 'ovino'],
    severidad: 'alta',
    sintomas: ['fiebre', 'cojera', 'hinchazon', 'apatia', 'noCome'],
    descripcion: 'Bacteriana por Clostridium chauvoei. Afecta a bovinos jóvenes (4 meses - 2 años). Muerte súbita en 12-48h. Endémica en México.',
    tratamiento: 'Penicilina G dosis altas vía intramuscular si se detecta a tiempo. Drenaje quirúrgico del músculo afectado. Pronóstico reservado.',
    prevencion: 'Vacuna polivalente clostridial (bacterina anaerobia) anual desde los 4 meses. Refuerzo en zonas endémicas.',
    notificable: false,
    fuente: 'SENASICA · Club Ganadero'
  },
  {
    id: 'leptospirosis',
    nombre: 'Leptospirosis',
    especies: ['bovino', 'porcino', 'ovino', 'caprino'],
    severidad: 'media',
    sintomas: ['fiebre', 'ictericia', 'aborto', 'infertilidad', 'palidez'],
    descripcion: 'Zoonosis bacteriana (Leptospira spp). Transmisión por orina contaminada, agua estancada. Causa abortos, ictericia, mortalidad en neonatos.',
    tratamiento: 'Estreptomicina 25 mg/kg IM o oxitetraciclina 20 mg/kg IM. Tratar todo el hato durante brotes.',
    prevencion: 'Vacuna pentavalente (serovariedades hardjo, pomona, canicola, icterohaemorrhagiae, grippotyphosa). Control de roedores. Aguas limpias.',
    notificable: false,
    fuente: 'INIFAP · SENASICA'
  },
  {
    id: 'cetosisGestacional',
    nombre: 'Cetosis / Toxemia de la preñez',
    especies: ['bovino', 'ovino', 'caprino'],
    severidad: 'media',
    sintomas: ['noCome', 'debilidad', 'apatia', 'perdidaPeso'],
    descripcion: 'Trastorno metabólico por balance energético negativo en hembras de alta producción al inicio de la lactancia o final de gestación.',
    tratamiento: 'Solución de glucosa 50% IV (250-500 mL). Propilenglicol 250-300 mL oral 2 veces al día por 3-5 días. Dexametasona en casos severos.',
    prevencion: 'Adecuada condición corporal al parto (3.0-3.5). Suplementación energética 3 semanas antes y después del parto. Evitar engrasamiento excesivo.',
    notificable: false,
    fuente: 'NRC · MVZ Práctica Clínica'
  },
  {
    id: 'hipocalcemia',
    nombre: 'Fiebre de leche / Hipocalcemia puerperal',
    especies: ['bovino', 'caprino'],
    severidad: 'alta',
    sintomas: ['caidas', 'temblores', 'paralisis', 'debilidad', 'noCome'],
    descripcion: 'Deficiencia de calcio al inicio de la lactancia. Común en vacas Holstein de 3+ partos. Urgencia metabólica.',
    tratamiento: 'URGENCIA. Gluconato de calcio 23% IV lento (500 mL) bajo monitoreo cardíaco. Repetir SC si recurre. Recuperación en 2-4 horas.',
    prevencion: 'Dieta aniónica las 3 semanas previas al parto. Suplemento de vitamina D 7-10 días antes del parto. Limitar calcio en seca.',
    notificable: false,
    fuente: 'NRC Dairy · MVZ Práctica'
  },

  // ═══ PORCINOS ═══
  {
    id: 'pestePorcina',
    nombre: 'Peste porcina clásica',
    especies: ['porcino'],
    severidad: 'alta',
    sintomas: ['fiebre', 'apatia', 'diarrea', 'temblores', 'noCome', 'palidez', 'paralisis'],
    descripcion: 'Viral altamente contagiosa. ENFERMEDAD DE NOTIFICACIÓN OBLIGATORIA. México declarado libre desde 2009 pero hay riesgo de reintroducción.',
    tratamiento: 'NO HAY tratamiento. SACRIFICIO sanitario. Notificación inmediata a SENASICA.',
    prevencion: 'Vacunación (donde aplique). Cuarentena estricta. Bioseguridad en granjas. Importaciones controladas.',
    notificable: true,
    fuente: 'SENASICA · NOM-037-ZOO-1995'
  },
  {
    id: 'parvovirosisPorcina',
    nombre: 'Parvovirosis porcina',
    especies: ['porcino'],
    severidad: 'media',
    sintomas: ['aborto', 'infertilidad'],
    descripcion: 'Viral. Causa fallas reproductivas: momificaciones, mortinatos, lechones débiles. Las cerdas no muestran otros signos.',
    tratamiento: 'No hay tratamiento curativo. Manejo de las pérdidas reproductivas.',
    prevencion: 'Vacunación de cerdas y sementales 2-4 semanas antes de monta. Refuerzo cada 6 meses.',
    notificable: false,
    fuente: 'SENASICA · MVZ Porcicultura'
  },
  {
    id: 'colibacilosisLechones',
    nombre: 'Colibacilosis (diarrea de lechones)',
    especies: ['porcino', 'bovino'],
    severidad: 'alta',
    sintomas: ['diarrea', 'deshidratacion', 'debilidad', 'caidas'],
    descripcion: 'E. coli en lechones recién nacidos. Diarrea profusa, deshidratación rápida. Mortalidad alta sin tratamiento.',
    tratamiento: 'Rehidratación oral (electrolitos). Antibiótico vía oral (enrofloxacina, gentamicina). Mantener temperatura corporal.',
    prevencion: 'Calostro adecuado primeras 6 horas. Vacuna a cerdas antes del parto. Higiene en maternidad. Temperatura óptima.',
    notificable: false,
    fuente: 'INIFAP · SENASICA'
  },

  // ═══ AVES ═══
  {
    id: 'newcastleAves',
    nombre: 'Enfermedad de Newcastle',
    especies: ['avicola'],
    severidad: 'alta',
    sintomas: ['tos', 'dificultadRespirar', 'diarrea', 'paralisis', 'temblores', 'apatia'],
    descripcion: 'Viral altamente contagiosa. Una de las enfermedades más devastadoras en aves. Notificación obligatoria.',
    tratamiento: 'NO HAY tratamiento curativo. SACRIFICIO de aves enfermas. Cuarentena del lote. Notificación a SENASICA.',
    prevencion: 'Vacunación La Sota a 7 días + refuerzo. Bioseguridad estricta. Control de aves silvestres.',
    notificable: true,
    fuente: 'SENASICA · NOM-013-ZOO-1994'
  },
  {
    id: 'salmonelosisAves',
    nombre: 'Salmonelosis aviar',
    especies: ['avicola'],
    severidad: 'media',
    sintomas: ['diarrea', 'apatia', 'noCome', 'debilidad'],
    descripcion: 'Bacteriana (Salmonella pullorum/gallinarum/enteritidis). Pérdidas productivas. Zoonosis: contamina huevo y carne.',
    tratamiento: 'Antibióticos (enrofloxacina, sulfas). Considerar eliminación si es para postura comercial por riesgo zoonótico.',
    prevencion: 'Lotes libres certificados. Higiene en incubación. Control de roedores y moscas. Vacuna en producción comercial.',
    notificable: true,
    fuente: 'SENASICA'
  },
  {
    id: 'coccidiosisAves',
    nombre: 'Coccidiosis aviar',
    especies: ['avicola'],
    severidad: 'media',
    sintomas: ['diarreaSangre', 'apatia', 'noCome', 'debilidad', 'perdidaPeso'],
    descripcion: 'Parasitaria por Eimeria spp. Frecuente en pollos de engorda y pavipollos. Daña intestino.',
    tratamiento: 'Anticoccidiales: amprolio en agua de bebida 0.012-0.024% por 5-7 días. Toltrazuril, sulfaquinoxalina.',
    prevencion: 'Coccidiostatos en alimento (salinomicina, monensina). Manejo de cama seca. Densidad adecuada.',
    notificable: false,
    fuente: 'INIFAP · SENASICA'
  },

  // ═══ OVINOS / CAPRINOS ═══
  {
    id: 'enterotoxemia',
    nombre: 'Enterotoxemia (Clostridium perfringens)',
    especies: ['ovino', 'caprino', 'bovino'],
    severidad: 'alta',
    sintomas: ['caidas', 'convulsiones', 'diarrea', 'temblores', 'paralisis'],
    descripcion: 'Bacteriana. Muerte súbita en animales bien alimentados con cambios bruscos de dieta. Tipos C y D.',
    tratamiento: 'Antitoxina específica si está disponible. Antibiótico (penicilina) + antiinflamatorio. Pronóstico reservado.',
    prevencion: 'Vacuna bacterina-toxoide clostridial 2 veces al año. Cambios graduales de dieta. Evitar engorda muy rápida.',
    notificable: false,
    fuente: 'SENASICA · INIFAP'
  },
  {
    id: 'gusaneraMiasis',
    nombre: 'Miasis (gusanera)',
    especies: ['bovino', 'ovino', 'caprino', 'porcino'],
    severidad: 'media',
    sintomas: ['heridas', 'moscas', 'cojera'],
    descripcion: 'Infestación de heridas con larvas de moscas (Cochliomyia macellaria). El gusano barrenador (C. hominivorax) está ERRADICADO en México pero hay vigilancia.',
    tratamiento: 'Limpieza mecánica de larvas. Aplicación de larvicida (cipermetrina, ivermectina tópica). Antibiótico si hay infección. Notificar a SENASICA si sospecha de gusano barrenador.',
    prevencion: 'Inspección frecuente. Evitar heridas (descorne, castración a edad correcta). Aplicar larvicida preventivo en heridas frescas.',
    notificable: true,
    fuente: 'SENASICA · Campaña Nacional'
  },
  {
    id: 'parasitosisInternos',
    nombre: 'Parasitosis gastrointestinal',
    especies: ['bovino', 'ovino', 'caprino', 'porcino'],
    severidad: 'baja',
    sintomas: ['diarrea', 'perdidaPeso', 'palidez', 'debilidad', 'apatia', 'caidaPelo'],
    descripcion: 'Nematodos (Haemonchus, Ostertagia, Cooperia), céstodos (Moniezia), trematodos (Fasciola). Pérdidas productivas crónicas.',
    tratamiento: 'Antihelmínticos: ivermectina 0.2 mg/kg, albendazol 5-10 mg/kg, levamisol 8 mg/kg. Rotar principios activos para evitar resistencia.',
    prevencion: 'Desparasitación estratégica 2-3 veces/año según región. Rotación de potreros. Monitoreo de carga parasitaria por coprología.',
    notificable: false,
    fuente: 'INIFAP · MVZ Práctica Rural'
  },
  {
    id: 'pietin',
    nombre: 'Pietín ovino-caprino (Foot rot)',
    especies: ['ovino', 'caprino'],
    severidad: 'media',
    sintomas: ['cojera', 'heridas'],
    descripcion: 'Bacteriana (Dichelobacter nodosus + Fusobacterium). Húmeda, lesiones en pezuñas. Cojera severa.',
    tratamiento: 'Despezuñado y limpieza. Baño de pezuñas con sulfato de zinc 10% o formol 5%. Antibiótico sistémico (oxitetraciclina) en casos severos.',
    prevencion: 'Pediluvio regular. Drenaje en corrales. Recorte de pezuñas. Vacunación en zonas endémicas.',
    notificable: false,
    fuente: 'SENASICA · MVZ Práctica'
  }
];

// ── Estado ──
let plan = 'free';
let especie = 'bovino';
const seleccion = new Set();

const ESPECIES = [
  { id: 'bovino',  label: 'Bovino',  emoji: '🐄' },
  { id: 'porcino', label: 'Porcino', emoji: '🐖' },
  { id: 'ovino',   label: 'Ovino',   emoji: '🐑' },
  { id: 'caprino', label: 'Caprino', emoji: '🐐' },
  { id: 'avicola', label: 'Avícola', emoji: '🐔' },
];

const CATEGORIAS = {
  general: 'Generales', digestivo: 'Digestivos', respiratorio: 'Respiratorios',
  locomocion: 'Locomoción', piel: 'Piel', reproductivo: 'Reproductivos',
  neurologico: 'Neurológicos', parasito: 'Parásitos',
};

const SEVERIDAD = {
  alta:  { label: 'GRAVE',    icon: '🚨', clase: 'sev-alta' },
  media: { label: 'MODERADA', icon: '⚠️', clase: 'sev-media' },
  baja:  { label: 'LEVE',     icon: '✓',  clase: 'sev-baja' },
};

const TEL_SENASICA = '01 800 751 2100';

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function bloqueadoPorFree() {
  if (plan === 'vip') return false;
  if (typeof window.abrirModalVIP === 'function') {
    window.abrirModalVIP('El Diagnóstico Veterinario con 22 enfermedades es exclusivo de Élite Pecuario.');
  }
  return true;
}

// ── Selector de especie ──
function pintarEspecies() {
  const cont = document.getElementById('diagEspecies');
  if (!cont) return;
  cont.innerHTML = ESPECIES.map(e => `
    <button type="button" class="diag-esp${e.id === especie ? ' active' : ''}" data-esp="${e.id}">
      <span aria-hidden="true">${e.emoji}</span>${esc(e.label)}
    </button>`).join('');
  cont.querySelectorAll('[data-esp]').forEach(b =>
    b.addEventListener('click', () => {
      especie = b.dataset.esp;
      seleccion.clear();
      pintarEspecies();
      pintarSintomas();
      limpiarResultados();
    }));
}

// ── Chips de síntomas por categoría ──
function pintarSintomas() {
  const cont = document.getElementById('diagSintomas');
  if (!cont) return;
  const porCat = {};
  SINTOMAS_CATALOGO.forEach(s => { (porCat[s.categoria] = porCat[s.categoria] || []).push(s); });

  cont.innerHTML = Object.entries(porCat).map(([cat, lista]) => `
    <div class="diag-cat">
      <h4>${esc(CATEGORIAS[cat] || cat)}</h4>
      <div class="diag-chips">
        ${lista.map(s => `
          <button type="button" class="diag-chip${seleccion.has(s.id) ? ' active' : ''}"
                  data-sint="${s.id}" aria-pressed="${seleccion.has(s.id)}">
            <span aria-hidden="true">${s.emoji}</span>${esc(s.label)}
          </button>`).join('')}
      </div>
    </div>`).join('');

  cont.querySelectorAll('[data-sint]').forEach(b =>
    b.addEventListener('click', () => {
      const id = b.dataset.sint;
      if (seleccion.has(id)) seleccion.delete(id); else seleccion.add(id);
      pintarSintomas();
    }));
  actualizarContador();
}

function actualizarContador() {
  const el = document.getElementById('diagContador');
  if (!el) return;
  const n = seleccion.size;
  el.textContent = n ? `${n} ${n === 1 ? 'síntoma marcado' : 'síntomas marcados'}` : 'Ningún síntoma marcado';
}
function limpiarResultados() {
  const c = document.getElementById('diagResultados');
  if (c) { c.style.display = 'none'; c.innerHTML = ''; }
}

// ═══════════════════════════════════════════════════════════
// MOTOR — mismo orden que el portal actual (index.html:15234).
// El score ordena; NO se muestra como porcentaje. Ver cabecera.
// ═══════════════════════════════════════════════════════════
function coincidencias() {
  const activos = [...seleccion];
  return ENFERMEDADES_DB
    .filter(e => e.especies.includes(especie))
    .map(e => {
      const match = e.sintomas.filter(s => activos.includes(s));
      const recall = match.length / e.sintomas.length;
      const precision = match.length / activos.length;
      const score = (recall * 0.6 + precision * 0.4) * 100;   // solo para ordenar
      return { ...e, match, score, recall };
    })
    .filter(r => r.match.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// Etiqueta cualitativa sobre la FRACCIÓN de síntomas de la enfermedad que
// están presentes. No es probabilidad: es cuánto se parece el cuadro.
function nivelCoincidencia(recall) {
  if (recall >= 0.66) return { label: 'Coincidencia alta',  clase: 'co-alta' };
  if (recall >= 0.34) return { label: 'Coincidencia media', clase: 'co-media' };
  return { label: 'Coincidencia baja', clase: 'co-baja' };
}

const DISCLAIMER = `
  <div class="diag-disc">
    <h3>⚕️ Antes de seguir, léelo</h3>
    <p>Esto es una <b>herramienta de orientación</b> basada en la base de datos de SENASICA,
       INIFAP y SADER. <b>NO reemplaza el diagnóstico clínico de un Médico Veterinario
       Zootecnista certificado.</b></p>
    <p>Si tu animal presenta <b>síntomas graves</b> (no se levanta, dificultad respiratoria
       severa, parálisis, sangrado), busca atención veterinaria <b>de urgencia</b>.</p>
    <p class="diag-disc-tel"><b>SENASICA — Notificación de enfermedades:</b> ${TEL_SENASICA}</p>
  </div>`;

const NOTA_COINCIDENCIA = `
  <p class="diag-nota-co">
    ℹ️ La coincidencia de síntomas <b>no es una probabilidad ni mide gravedad</b>.
    Una coincidencia baja <b>no descarta</b> una enfermedad grave. Ante la duda, consulta a tu MVZ.
  </p>`;

function diagnosticar() {
  if (bloqueadoPorFree()) return;
  const cont = document.getElementById('diagResultados');
  if (!cont) return;

  const alerta = document.getElementById('diagAlert');
  if (seleccion.size === 0) {
    if (alerta) { alerta.textContent = 'Marca al menos un síntoma.'; alerta.className = 'h-alert h-alert--aviso show'; }
    return;
  }
  if (alerta) alerta.className = 'h-alert';

  const res = coincidencias();
  cont.style.display = 'block';

  if (!res.length) {
    cont.innerHTML = DISCLAIMER + `
      <div class="h-estado">
        <span class="h-estado-emoji" aria-hidden="true">🤔</span>
        <h3>Ningún cuadro coincide</h3>
        <p>Los síntomas que marcaste no coinciden con nuestra base de 22 enfermedades.
           <b>Eso no significa que tu animal esté bien: consulta a un MVZ certificado lo antes posible.</b></p>
        <p class="diag-disc-tel">SENASICA: <b>${TEL_SENASICA}</b></p>
      </div>`;
    cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  cont.innerHTML = DISCLAIMER + `
    <div class="diag-res-head">
      <h2>🔬 Cuadros que coinciden</h2>
      <p>Ordenados por qué tanto se parecen a los síntomas que marcaste.
         <b>Es una orientación, no un diagnóstico.</b></p>
    </div>
    ${NOTA_COINCIDENCIA}
    ${res.map((r, i) => tarjeta(r, i)).join('')}`;
  cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function tarjeta(r, i) {
  const sev = SEVERIDAD[r.severidad] || SEVERIDAD.media;
  const co = nivelCoincidencia(r.recall);
  // Grave o notificable se destacan SIEMPRE, aunque la coincidencia sea baja:
  // pocos síntomas coincidentes no significa que importe poco.
  const destacada = r.severidad === 'alta' || r.notificable;

  return `
    <article class="diag-card ${sev.clase}${destacada ? ' diag-card--destacada' : ''}">
      <div class="diag-card-head">
        <span class="diag-rank">${i + 1}</span>
        <div class="diag-card-id">
          <h3>${esc(r.nombre)}</h3>
          <div class="diag-badges">
            <span class="diag-badge ${co.clase}">${co.label} · ${r.match.length} de ${r.sintomas.length} síntomas</span>
            <span class="diag-badge diag-badge-sev">${sev.icon} ${sev.label}</span>
            ${r.notificable ? '<span class="diag-badge diag-badge-notif">🚨 NOTIFICACIÓN OBLIGATORIA SENASICA</span>' : ''}
          </div>
        </div>
      </div>

      <p class="diag-desc">${esc(r.descripcion)}</p>

      <div class="diag-bloque">
        <h4>💊 Tratamiento</h4>
        <p>${esc(r.tratamiento)}</p>
        <p class="diag-aviso-dosis">
          ⚠️ <b>Dosis de referencia — confírmala con tu MVZ antes de medicar.
          Automedicar puede dañar al animal.</b>
        </p>
      </div>

      <div class="diag-bloque">
        <h4>🛡️ Prevención</h4>
        <p>${esc(r.prevencion)}</p>
      </div>

      ${r.notificable ? `
      <p class="diag-aviso-notif">
        🚨 Esta enfermedad es de <b>notificación obligatoria</b>. Repórtala a SENASICA: <b>${TEL_SENASICA}</b>
      </p>` : ''}

      <div class="diag-fuente">📚 Fuente: ${esc(r.fuente)}</div>
    </article>`;
}

// ═══════════════════════════════════════════════════════════
export function iniciarDiagnostico(planUsuario) {
  plan = planUsuario || 'free';
  if (!document.getElementById('diagSintomas')) return;
  pintarEspecies();
  pintarSintomas();
}

export function montarDiagnostico() {
  document.getElementById('btnDiagnosticar')?.addEventListener('click', diagnosticar);
  document.getElementById('diagLimpiar')?.addEventListener('click', () => {
    seleccion.clear();
    pintarSintomas();
    limpiarResultados();
  });
}
