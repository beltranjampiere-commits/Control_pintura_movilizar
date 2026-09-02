// lib/algorithm.ts

type Status = 'pendiente' | 'en_proceso' | 'completado' | 'pausado';

export interface AssignmentDraft {
  vin: string;
  marca?: string;
  modelo?: string;
  color?: string;
  work_type: string;
  num_panos?: number;
  seccion?: string;
  technician_name: string;
  technician_role: string;
  status: Status;
}

export function sugerirAsignaciones(
  vehiculos: any[],
  asignacionesExistentes: any[],
  tecnicosPresentes: Record<string, boolean>,
  tecnicosConfig: Record<string, string[]>
): AssignmentDraft[] {
  const recomendaciones: AssignmentDraft[] = [];
  
  // 1. Filtrar técnicos disponibles por rol
  const pintoresDisp = tecnicosConfig.pintores.filter(t => tecnicosPresentes[t]);
  const desabolladoresDisp = tecnicosConfig.desabolladores.filter(t => tecnicosPresentes[t]);
  const pulidoresDisp = tecnicosConfig.pulidores.filter(t => tecnicosPresentes[t]);
  const movilizadoresDisp = tecnicosConfig.movilizadores.filter(t => tecnicosPresentes[t]);

  // Carga actual para balancear (paños para pintores/desabolladores, conteo para el resto)
  const carga: Record<string, number> = {};
  [...pintoresDisp, ...desabolladoresDisp, ...pulidoresDisp, ...movilizadoresDisp].forEach(t => {
    carga[t] = 0;
  });

  // Agregar la carga de asignaciones existentes
  const pulidorPorVehiculo: Record<string, string> = {};
  const pintorPorVehiculo: Record<string, string> = {};
  asignacionesExistentes.forEach(a => {
    if (carga[a.technician_name] !== undefined) {
      carga[a.technician_name] += (a.num_panos || 1); // usamos paños como peso o 1 por default
    }
    if (a.work_type === 'PULIR') {
      pulidorPorVehiculo[a.vin] = a.technician_name;
    }
    if (a.work_type === 'PAÑOS') {
      pintorPorVehiculo[a.vin] = a.technician_name;
    }
  });

  // 2. Ordenar vehículos por prioridad. (Ya vienen ordenados de index.tsx: vencido > hoy > mañana > ok)
  // Tomaremos solo los primeros 150 (o los que necesiten trabajo)
  const vehiculosPriorizados = vehiculos.filter(v => v.trabajos && v.trabajos.length > 0).slice(0, 150);

  // Helper para asignar balanceadamente
  const asignarBalanceado = (nombres: string[], peso: number, esDesabollador = false) => {
    if (nombres.length === 0) return null;
    
    // Ajustar cargas por habilidades (peso simulado)
    const cargasAjustadas = nombres.map(nombre => {
      let multiplicador = 1.0;
      // Pintores rápidos: Luis Hernandez, Fernando, Andy -> soportan más carga, dividimos su carga actual para que reciban más
      if (['Luis Hernandez', 'Fernando', 'Andy'].includes(nombre)) multiplicador = 0.7;
      // Casius es muy rápido
      if (nombre === 'Casius') multiplicador = 0.6;
      // Externo es más lento
      if (nombre === 'Proveedor externo') multiplicador = 1.3;

      return { nombre, score: carga[nombre] * multiplicador };
    });

    // Ordenar por el que tiene menor "score" (menos carga ponderada)
    cargasAjustadas.sort((a, b) => a.score - b.score);
    const elegido = cargasAjustadas[0].nombre;
    
    carga[elegido] += peso;
    return elegido;
  };

  // 3. Iterar vehículos y sus trabajos pendientes
  vehiculosPriorizados.forEach(v => {
    // Generar un trabajo de Movilización automático por vehículo si no está asignado ya
    const yaMovilizado = asignacionesExistentes.some(a => a.vin === v.vin && a.work_type === 'MOVILIZAR') ||
                         recomendaciones.some(r => r.vin === v.vin && r.work_type === 'MOVILIZAR');
    
    if (!yaMovilizado && movilizadoresDisp.length > 0) {
      const mov = asignarBalanceado(movilizadoresDisp, 1);
      if (mov) {
        recomendaciones.push({
          vin: v.vin, marca: v.marca, modelo: v.modelo, color: v.color,
          work_type: 'MOVILIZAR', seccion: 'General', num_panos: 0,
          technician_name: mov, technician_role: 'movilizador', status: 'pendiente'
        });
      }
    }

    // Trabajos de pintura/desabollado/pulido
    v.trabajos.forEach((t: any) => {
      // Verificar si ya está asignado
      const yaAsignado = asignacionesExistentes.some(a => a.vin === v.vin && a.seccion === t.seccion && a.work_type === t.tipo);
      if (yaAsignado) return;

      // REGLA 1: Ignorar "Cielo Raso" (se hace en área de Acondicionado)
      if (t.seccion && t.seccion.toLowerCase().includes('cielo raso')) {
        return; 
      }

      let techAsignado = null;
      let roleAsignado = '';
      
      const peso = t.numPanos > 0 ? t.numPanos : 1; // Si no tiene paños (ej. pulir/revisar), vale 1 tarea

      // REGLA 4: Si tiene "aboll" (abolladura, abollado), crear una tarea EXTRA de DESABOLLAR para el desabollador
      const tieneAbolladura = (t.diagnostico || '').toLowerCase().includes('aboll') || (t.comentario || '').toLowerCase().includes('aboll');

      if (tieneAbolladura && t.tipo !== 'DESABOLLAR') {
        let desabTech = null;
        // REGLA 5: Trabajos grandes de abolladura (> 1 paño) van al Proveedor externo
        if (t.numPanos > 1 && desabolladoresDisp.includes('Proveedor externo')) {
          desabTech = 'Proveedor externo';
          carga['Proveedor externo'] += peso;
        } else {
          desabTech = asignarBalanceado(desabolladoresDisp, peso, true);
        }
        
        if (desabTech) {
          recomendaciones.push({
            vin: v.vin,
            marca: v.marca,
            modelo: v.modelo,
            color: v.color,
            work_type: 'DESABOLLAR',
            num_panos: t.numPanos || 0,
            seccion: t.seccion,
            technician_name: desabTech,
            technician_role: 'desabollador',
            status: 'pendiente'
          });
        }
      }

      // Procesar la tarea original según su tipo
      if (t.tipo === 'DESABOLLAR' || t.tipo === 'REVISAR') {
        if (t.numPanos > 1 && desabolladoresDisp.includes('Proveedor externo')) {
          techAsignado = 'Proveedor externo';
          carga['Proveedor externo'] += peso;
        } else {
          techAsignado = asignarBalanceado(desabolladoresDisp, peso, true);
        }
        roleAsignado = 'desabollador';
      } else if (t.tipo === 'PAÑOS') {
        // REGLA 2: Minibans KYC (V3, V5, V7) a Yader
        const modeloStr = (v.modelo || '').toUpperCase();
        const marcaStr = (v.marca || '').toUpperCase();
        const esKYC = marcaStr.includes('KYC') || modeloStr.includes('KYC');
        const esV3V5V7 = modeloStr.includes('V3') || modeloStr.includes('V5') || modeloStr.includes('V7');
        
        if (esKYC && esV3V5V7 && pintoresDisp.includes('Yader')) {
          techAsignado = 'Yader';
          carga['Yader'] += peso;
        } else {
          // REGLA 7: Un solo pintor por vehículo
          if (pintorPorVehiculo[v.vin] && pintoresDisp.includes(pintorPorVehiculo[v.vin])) {
            techAsignado = pintorPorVehiculo[v.vin];
            carga[techAsignado] += peso;
          } else {
            techAsignado = asignarBalanceado(pintoresDisp, peso);
            if (techAsignado) pintorPorVehiculo[v.vin] = techAsignado;
          }
        }
        roleAsignado = 'pintor';
      } else if (t.tipo === 'PULIR') {
        // REGLA 3: Para las minibans KYC (V3, V5, V7), todo lo de pulir se va a Jairo
        const modeloStr = (v.modelo || '').toUpperCase();
        const marcaStr = (v.marca || '').toUpperCase();
        const esKYC = marcaStr.includes('KYC') || modeloStr.includes('KYC');
        const esV3V5V7 = modeloStr.includes('V3') || modeloStr.includes('V5') || modeloStr.includes('V7');

        if (esKYC && esV3V5V7 && pulidoresDisp.includes('Jairo')) {
          techAsignado = 'Jairo';
          carga['Jairo'] += 1;
        } else {
          // REGLA 6: Un solo pulidor por vehículo para optimizar tiempos
          if (pulidorPorVehiculo[v.vin] && pulidoresDisp.includes(pulidorPorVehiculo[v.vin])) {
            techAsignado = pulidorPorVehiculo[v.vin];
            carga[techAsignado] += 1;
          } else {
            techAsignado = asignarBalanceado(pulidoresDisp, 1);
            if (techAsignado) pulidorPorVehiculo[v.vin] = techAsignado;
          }
        }
        roleAsignado = 'pulidor';
      }

      if (techAsignado) {
        recomendaciones.push({
          vin: v.vin,
          marca: v.marca,
          modelo: v.modelo,
          color: v.color,
          work_type: t.tipo,
          num_panos: t.numPanos || 0,
          seccion: t.seccion,
          technician_name: techAsignado,
          technician_role: roleAsignado,
          status: 'pendiente'
        });
      }
    });
  });

  // 6. Enriquecer los trabajos de MOVILIZAR para decir a quién llevar
  recomendaciones.forEach(r => {
    if (r.work_type === 'MOVILIZAR') {
      const techsVin = new Set<string>();
      [...asignacionesExistentes, ...recomendaciones].forEach(a => {
        if (a.vin === r.vin && a.work_type !== 'MOVILIZAR') {
          techsVin.add(a.technician_name);
        }
      });
      if (techsVin.size > 0) {
        r.seccion = `General (Llevar a: ${Array.from(techsVin).join(', ')})`;
      }
    }
  });

  return recomendaciones;
}
