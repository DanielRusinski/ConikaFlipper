export class BoardValidator {
    validate(tilesX, tilesY, obstacles, spawnGridX, spawnGridY) {
        const totalTiles = tilesX * tilesY;
        const visited = new Uint8Array(totalTiles);
        let reachableCount = 0;
        
        const queue = [spawnGridY * tilesX + spawnGridX];
        visited[spawnGridY * tilesX + spawnGridX] = 1;
        
        const dirs = [
            [-1, 0], [1, 0], [0, -1], [0, 1]
        ];
        
        let head = 0;
        while (head < queue.length) {
            const curr = queue[head++];
            reachableCount++;
            
            const cx = curr % tilesX;
            const cy = Math.floor(curr / tilesX);
            
            for (const [dx, dy] of dirs) {
                const nx = cx + dx;
                const ny = cy + dy;
                
                if (nx >= 0 && nx < tilesX && ny >= 0 && ny < tilesY) {
                    const nIdx = ny * tilesX + nx;
                    if (!visited[nIdx] && !obstacles.has(nIdx)) {
                        visited[nIdx] = 1;
                        queue.push(nIdx);
                    }
                }
            }
        }
        
        const totalPlayable = totalTiles - obstacles.size;
        const valid = reachableCount >= totalPlayable * 0.7;
        
        return { valid, reachableCount, totalPlayable };
    }
}
