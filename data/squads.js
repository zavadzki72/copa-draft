/* ============================================================
   COPA DRAFT — data/squads.js
   Mock squad pool: 4 national teams × 2 World Cup years each,
   ~18 players per squad. Minimal data per player; FIFA-style
   attributes are DERIVED (see lib/derive.js), never hand-authored.

   Append real squads later by pushing to window.SQUADS — the game
   code reads only this array and never hard-codes a team/cup.

   position : GOL | ZAG | LAT | MEI | ATA
   archetype: craque | velocista | cerebral | muralha | motorzinho
              | finalizador | lider
   ============================================================ */
(function () {
  // helper to stamp ids + team/cup onto a compact player list
  function squad(meta, players) {
    const slug = meta.team.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return {
      id: `${slug}${meta.cup}`,
      team: meta.team,
      code: meta.code,        // flag-icons country code
      cup: meta.cup,
      host: meta.host,
      players: players.map(p => ({
        id: `${slug}${meta.cup}-` + p[0].toLowerCase().normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ''),
        name: p[0],
        pos: p[1],
        age: p[2],
        overall: p[3],
        archetype: p[4],
        leader: !!p[5],
        team: meta.team,
        code: meta.code,
        cup: meta.cup,
      })),
    };
  }

  window.SQUADS = [
    /* ===================== BRASIL 1970 ===================== */
    squad({ team: 'Brasil', code: 'br', cup: 1970, host: 'México' }, [
      ['Félix', 'GOL', 29, 78, 'muralha'],
      ['Ado', 'GOL', 24, 70, 'muralha'],
      ['Brito', 'ZAG', 30, 80, 'muralha', true],
      ['Piazza', 'ZAG', 27, 82, 'cerebral'],
      ['Joel Camargo', 'ZAG', 24, 74, 'muralha'],
      ['Fontana', 'ZAG', 29, 73, 'muralha'],
      ['Carlos Alberto', 'LAT', 25, 88, 'lider', true],
      ['Everaldo', 'LAT', 25, 80, 'velocista'],
      ['Marco Antônio', 'LAT', 19, 72, 'velocista'],
      ['Clodoaldo', 'MEI', 21, 84, 'motorzinho'],
      ['Gérson', 'MEI', 29, 90, 'cerebral', true],
      ['Rivelino', 'MEI', 24, 90, 'craque'],
      ['Paulo Cézar', 'MEI', 21, 80, 'velocista'],
      ['Edu', 'MEI', 20, 78, 'velocista'],
      ['Pelé', 'ATA', 29, 98, 'craque', true],
      ['Jairzinho', 'ATA', 25, 91, 'finalizador'],
      ['Tostão', 'ATA', 23, 89, 'finalizador'],
      ['Roberto Miranda', 'ATA', 26, 76, 'finalizador'],
    ]),

    /* ===================== BRASIL 2002 ===================== */
    squad({ team: 'Brasil', code: 'br', cup: 2002, host: 'Coreia/Japão' }, [
      ['Marcos', 'GOL', 28, 84, 'muralha', true],
      ['Dida', 'GOL', 28, 80, 'muralha'],
      ['Lúcio', 'ZAG', 24, 85, 'muralha'],
      ['Roque Júnior', 'ZAG', 26, 80, 'muralha'],
      ['Edmílson', 'ZAG', 26, 80, 'cerebral'],
      ['Anderson Polga', 'ZAG', 23, 74, 'muralha'],
      ['Cafu', 'LAT', 32, 88, 'lider', true],
      ['Roberto Carlos', 'LAT', 29, 89, 'velocista'],
      ['Juliano Belletti', 'LAT', 26, 78, 'velocista'],
      ['Gilberto Silva', 'MEI', 25, 82, 'motorzinho'],
      ['Kléberson', 'MEI', 23, 78, 'motorzinho'],
      ['Juninho Paulista', 'MEI', 28, 80, 'cerebral'],
      ['Ronaldinho', 'MEI', 22, 90, 'craque'],
      ['Denílson', 'MEI', 24, 80, 'velocista'],
      ['Ronaldo', 'ATA', 25, 95, 'finalizador', true],
      ['Rivaldo', 'ATA', 30, 91, 'craque', true],
      ['Edílson', 'ATA', 31, 78, 'velocista'],
      ['Luizão', 'ATA', 27, 77, 'finalizador'],
    ]),

    /* ===================== ARGENTINA 1986 ===================== */
    squad({ team: 'Argentina', code: 'ar', cup: 1986, host: 'México' }, [
      ['Nery Pumpido', 'GOL', 28, 80, 'muralha'],
      ['Luis Islas', 'GOL', 21, 70, 'muralha'],
      ['José Luis Brown', 'ZAG', 30, 80, 'muralha', true],
      ['Oscar Ruggeri', 'ZAG', 24, 83, 'muralha'],
      ['José Cuciuffo', 'ZAG', 25, 76, 'muralha'],
      ['Daniel Passarella', 'ZAG', 33, 84, 'lider', true],
      ['Julio Olarticoechea', 'LAT', 28, 78, 'velocista'],
      ['Néstor Clausen', 'LAT', 24, 74, 'velocista'],
      ['Oscar Garré', 'LAT', 29, 75, 'muralha'],
      ['Sergio Batista', 'MEI', 24, 80, 'motorzinho'],
      ['Ricardo Giusti', 'MEI', 29, 78, 'motorzinho'],
      ['Jorge Burruchaga', 'MEI', 23, 85, 'cerebral'],
      ['Héctor Enrique', 'MEI', 24, 78, 'motorzinho'],
      ['Diego Maradona', 'MEI', 25, 99, 'craque', true],
      ['Carlos Tapia', 'MEI', 24, 74, 'cerebral'],
      ['Jorge Valdano', 'ATA', 30, 84, 'finalizador', true],
      ['Pedro Pasculli', 'ATA', 26, 76, 'finalizador'],
      ['Claudio Borghi', 'ATA', 22, 78, 'craque'],
    ]),

    /* ===================== ARGENTINA 2022 ===================== */
    squad({ team: 'Argentina', code: 'ar', cup: 2022, host: 'Catar' }, [
      ['Emiliano Martínez', 'GOL', 30, 86, 'muralha', true],
      ['Gerónimo Rulli', 'GOL', 30, 78, 'muralha'],
      ['Cristian Romero', 'ZAG', 24, 85, 'muralha'],
      ['Nicolás Otamendi', 'ZAG', 34, 82, 'muralha', true],
      ['Lisandro Martínez', 'ZAG', 24, 82, 'muralha'],
      ['Germán Pezzella', 'ZAG', 31, 78, 'cerebral'],
      ['Nahuel Molina', 'LAT', 24, 80, 'velocista'],
      ['Marcos Acuña', 'LAT', 31, 80, 'motorzinho'],
      ['Gonzalo Montiel', 'LAT', 25, 77, 'velocista'],
      ['Rodrigo De Paul', 'MEI', 28, 84, 'motorzinho'],
      ['Enzo Fernández', 'MEI', 21, 84, 'cerebral'],
      ['Alexis Mac Allister', 'MEI', 23, 84, 'cerebral'],
      ['Leandro Paredes', 'MEI', 28, 80, 'cerebral'],
      ['Papu Gómez', 'MEI', 34, 79, 'velocista'],
      ['Lionel Messi', 'ATA', 35, 96, 'craque', true],
      ['Julián Álvarez', 'ATA', 22, 85, 'finalizador'],
      ['Ángel Di María', 'ATA', 34, 85, 'velocista', true],
      ['Lautaro Martínez', 'ATA', 25, 84, 'finalizador'],
    ]),

    /* ===================== FRANÇA 1998 ===================== */
    squad({ team: 'França', code: 'fr', cup: 1998, host: 'França' }, [
      ['Fabien Barthez', 'GOL', 27, 84, 'muralha'],
      ['Bernard Lama', 'GOL', 35, 78, 'muralha'],
      ['Marcel Desailly', 'ZAG', 29, 87, 'muralha', true],
      ['Laurent Blanc', 'ZAG', 32, 84, 'cerebral', true],
      ['Frank Lebœuf', 'ZAG', 30, 80, 'cerebral'],
      ['Lilian Thuram', 'LAT', 26, 86, 'velocista'],
      ['Bixente Lizarazu', 'LAT', 28, 83, 'velocista'],
      ['Vincent Candela', 'LAT', 24, 78, 'velocista'],
      ['Didier Deschamps', 'MEI', 29, 83, 'motorzinho', true],
      ['Emmanuel Petit', 'MEI', 27, 82, 'motorzinho'],
      ['Zinedine Zidane', 'MEI', 26, 95, 'craque'],
      ['Youri Djorkaeff', 'MEI', 30, 84, 'cerebral'],
      ['Christian Karembeu', 'MEI', 27, 78, 'motorzinho'],
      ['Robert Pirès', 'MEI', 24, 80, 'velocista'],
      ['Thierry Henry', 'ATA', 20, 84, 'velocista'],
      ['David Trezeguet', 'ATA', 20, 82, 'finalizador'],
      ['Stéphane Guivarc\'h', 'ATA', 27, 74, 'finalizador'],
      ['Christophe Dugarry', 'ATA', 26, 78, 'finalizador'],
    ]),

    /* ===================== FRANÇA 2018 ===================== */
    squad({ team: 'França', code: 'fr', cup: 2018, host: 'Rússia' }, [
      ['Hugo Lloris', 'GOL', 31, 85, 'muralha', true],
      ['Steve Mandanda', 'GOL', 33, 78, 'muralha'],
      ['Raphaël Varane', 'ZAG', 25, 87, 'muralha'],
      ['Samuel Umtiti', 'ZAG', 24, 83, 'muralha'],
      ['Presnel Kimpembe', 'ZAG', 22, 79, 'muralha'],
      ['Benjamin Pavard', 'LAT', 22, 81, 'velocista'],
      ['Lucas Hernández', 'LAT', 22, 82, 'velocista'],
      ['Djibril Sidibé', 'LAT', 25, 78, 'velocista'],
      ['N\'Golo Kanté', 'MEI', 27, 88, 'motorzinho'],
      ['Paul Pogba', 'MEI', 25, 87, 'cerebral'],
      ['Blaise Matuidi', 'MEI', 31, 81, 'motorzinho'],
      ['Corentin Tolisso', 'MEI', 23, 80, 'motorzinho'],
      ['Steven Nzonzi', 'MEI', 29, 78, 'motorzinho'],
      ['Kylian Mbappé', 'ATA', 19, 90, 'velocista'],
      ['Antoine Griezmann', 'ATA', 27, 89, 'craque', true],
      ['Olivier Giroud', 'ATA', 31, 83, 'finalizador', true],
      ['Ousmane Dembélé', 'ATA', 21, 82, 'velocista'],
      ['Florian Thauvin', 'ATA', 25, 78, 'velocista'],
    ]),

    /* ===================== ALEMANHA 1990 ===================== */
    squad({ team: 'Alemanha', code: 'de', cup: 1990, host: 'Itália' }, [
      ['Bodo Illgner', 'GOL', 24, 82, 'muralha'],
      ['Andreas Köpke', 'GOL', 28, 76, 'muralha'],
      ['Klaus Augenthaler', 'ZAG', 32, 82, 'muralha', true],
      ['Jürgen Kohler', 'ZAG', 24, 84, 'muralha'],
      ['Guido Buchwald', 'ZAG', 29, 82, 'muralha'],
      ['Hans Pflügler', 'ZAG', 30, 76, 'muralha'],
      ['Andreas Brehme', 'LAT', 29, 85, 'cerebral', true],
      ['Thomas Berthold', 'LAT', 25, 80, 'velocista'],
      ['Stefan Reuter', 'LAT', 24, 78, 'velocista'],
      ['Lothar Matthäus', 'MEI', 29, 92, 'lider', true],
      ['Thomas Häßler', 'MEI', 24, 82, 'cerebral'],
      ['Pierre Littbarski', 'MEI', 30, 82, 'velocista'],
      ['Olaf Thon', 'MEI', 24, 80, 'cerebral'],
      ['Uwe Bein', 'MEI', 29, 78, 'cerebral'],
      ['Jürgen Klinsmann', 'ATA', 25, 88, 'finalizador'],
      ['Rudi Völler', 'ATA', 30, 86, 'finalizador', true],
      ['Karl-Heinz Riedle', 'ATA', 24, 80, 'finalizador'],
      ['Frank Mill', 'ATA', 32, 73, 'velocista'],
    ]),

    /* ===================== ALEMANHA 2014 ===================== */
    squad({ team: 'Alemanha', code: 'de', cup: 2014, host: 'Brasil' }, [
      ['Manuel Neuer', 'GOL', 28, 92, 'muralha', true],
      ['Roman Weidenfeller', 'GOL', 33, 78, 'muralha'],
      ['Mats Hummels', 'ZAG', 25, 87, 'cerebral'],
      ['Jérôme Boateng', 'ZAG', 25, 85, 'muralha'],
      ['Per Mertesacker', 'ZAG', 29, 82, 'muralha', true],
      ['Philipp Lahm', 'LAT', 30, 88, 'cerebral', true],
      ['Benedikt Höwedes', 'LAT', 26, 80, 'muralha'],
      ['Erik Durm', 'LAT', 22, 74, 'velocista'],
      ['Bastian Schweinsteiger', 'MEI', 29, 88, 'motorzinho', true],
      ['Toni Kroos', 'MEI', 24, 89, 'cerebral'],
      ['Sami Khedira', 'MEI', 27, 84, 'motorzinho'],
      ['Mesut Özil', 'MEI', 25, 87, 'craque'],
      ['Christoph Kramer', 'MEI', 23, 76, 'motorzinho'],
      ['Thomas Müller', 'ATA', 24, 88, 'finalizador'],
      ['Miroslav Klose', 'ATA', 36, 84, 'finalizador', true],
      ['André Schürrle', 'ATA', 23, 82, 'velocista'],
      ['Mario Götze', 'ATA', 22, 84, 'craque'],
      ['Lukas Podolski', 'ATA', 29, 81, 'velocista'],
    ]),
  ];
})();
