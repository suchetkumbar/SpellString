import { loadAsciiLevel } from '../core/level';
import { Simulation } from '../core/sim';
import type { Grid } from '../core/grid';
import { MAT } from '../data/materials';

/** The living backdrop behind the title: a little cave where sand pours, water runs and a vent burns. */
const DEMO_MAP = `
################################################################################################
#                                                                                              #
#                                                                                              #
#                                                                                              #
#                                                                                              #
#        ######                                                          ######                #
#             #                                                          #                     #
#             #                     ||||||||||||                         #                     #
#             ###                   |          |                       ###                     #
#                                   |          |                                               #
#                                   |          |                                               #
#                                                                                              #
#      ####                    ####                     ####                   #####           #
#      #  #                    #  #======               #  #                   #   #           #
#      #  ##########           #  ##########            #  ##############      #   ######      #
#      #           #           #           #            #               #      #        #      #
#      #           #           #           #            #               #      #        #      #
#      ######  #####           ######  #####            ####  ###########      ###  #####      #
#                                                                                              #
################################################################################################`;

export class TitleDemo {
  readonly grid: Grid;
  readonly sim: Simulation;
  private tick = 0;

  constructor() {
    this.grid = loadAsciiLevel(DEMO_MAP, 7).grid;
    this.sim = new Simulation(this.grid, 7);
  }

  /** One tick: pour sand and water from the ledges, keep a little fire alive on the oil, clear the floor now and then. */
  step(): void {
    const t = this.tick++;
    const s = this.sim;
    if (t % 3 === 0) s.place(12, 6, MAT.sand);
    if (t % 2 === 0) s.place(76, 6, MAT.water);
    if (t % 4 === 0) s.place(40 + (t % 24) / 4, 12, MAT.fire);
    if (t % 5 === 0) s.place(22 + ((t / 5) % 3), 12, MAT.oil);
    if (t % 900 === 0) {
      // Drain the basins so the scene never fills up.
      for (let y = 13; y < 19; y++) for (let x = 1; x < this.grid.width - 1; x++) {
        const m = this.grid.get(x, y);
        if (m === MAT.sand || m === MAT.water || m === MAT.oil) s.place(x, y, MAT.empty);
      }
    }
    s.step();
  }
}
