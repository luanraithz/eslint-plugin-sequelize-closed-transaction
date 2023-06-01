module.exports = {
  rules: {
    transaction: {
      create(context) {
        const codePathExpressionMapStack = []
        const codePathSegmentStack = []
        return {
          onCodePathSegmentStart: segment => codePathSegmentStack.push(segment),
          onCodePathSegmentEnd: () => codePathSegmentStack.pop(),

          onCodePathStart: () => codePathExpressionMapStack.push(new Map()),
          onCodePathEnd(codePath, codePathNode) {
            const expressionsMap = codePathExpressionMapStack.pop();
            const cyclic = new Set()
            function countPathsFromStart(segment, pathHistory) {
              const { cache } = countPathsFromStart;
              let paths = cache.get(segment.id);
              const pathList = new Set(pathHistory);

              // If `pathList` includes the current segment then we've found a cycle!
              // We need to fill `cyclic` with all segments inside cycle
              if (pathList.has(segment.id)) {
                const pathArray = [...pathList];
                const cyclicSegments = pathArray.slice(
                  pathArray.indexOf(segment.id) + 1,
                );
                for (const cyclicSegment of cyclicSegments) {
                  cyclic.add(cyclicSegment);
                }

                return BigInt('0');
              }

              // add the current segment to pathList
              pathList.add(segment.id);

              // We have a cached `paths`. Return it.
              if (paths !== undefined) {
                return paths;
              }

              if (codePath.thrownSegments.includes(segment)) {
                paths = BigInt('0');
              } else if (segment.prevSegments.length === 0) {
                paths = BigInt('1');
              } else {
                paths = BigInt('0');
                for (const prevSegment of segment.prevSegments) {
                  paths += countPathsFromStart(prevSegment, pathList);
                }
              }

              // If our segment is reachable then there should be at least one path
              // to it from the start of our code path.
              if (segment.reachable && paths === BigInt('0')) {
                cache.delete(segment.id);
              } else {
                cache.set(segment.id, paths);
              }

              return paths;
            }

            countPathsFromStart.cache = new Map();
            countPathsToEnd.cache = new Map();

            function countPathsToEnd(segment, pathHistory) {
              const { cache } = countPathsToEnd;
              let paths = cache.get(segment.id);
              const pathList = new Set(pathHistory);

              // If `pathList` includes the current segment then we've found a cycle!
              // We need to fill `cyclic` with all segments inside cycle
              if (pathList.has(segment.id)) {
                const pathArray = Array.from(pathList);
                const cyclicSegments = pathArray.slice(
                  pathArray.indexOf(segment.id) + 1,
                );
                for (const cyclicSegment of cyclicSegments) {
                  cyclic.add(cyclicSegment);
                }

                return BigInt('0');
              }

              // add the current segment to pathList
              pathList.add(segment.id);

              // We have a cached `paths`. Return it.
              if (paths !== undefined) {
                return paths;
              }

              if (codePath.thrownSegments.includes(segment)) {
                paths = BigInt('0');
              } else if (segment.nextSegments.length === 0) {
                paths = BigInt('1');
              } else {
                paths = BigInt('0');
                for (const nextSegment of segment.nextSegments) {
                  paths += countPathsToEnd(nextSegment, pathList);
                }
              }

              cache.set(segment.id, paths);
              return paths;
            }
            const segmentsWithTransaction = []
            for (const [segment, expressions] of expressionsMap) {
              if (!segment.reachable) {
                continue;
              }

              for (const hook of expressions) {
                if (
                  hook.type === "MemberExpression" &&
                  (hook.object.name === "sequelize" ||
                    (hook.object.type === "MemberExpression" &&
                      hook.object.property.name === "sequelize")) &&
                  hook.property.name === "transaction"
                ) {
                  segment.hook = hook
                  segmentsWithTransaction.push(segment)
                }
              }
            }
            // Get final segments that are whitin a transaction scope
            const finalPathsWithinTransactionScope = codePath.finalSegments
              .filter(s => {
                let n = [s]
                while (n.length) {
                  if (n.some(s => segmentsWithTransaction.some(s1 => s1.id === s.id))) {
                    return true
                  }
                  n = n.map(s => s.prevSegments).flatMap(l => l)
                }
                return false
              })
            const idsWithTransactons = segmentsWithTransaction.map(s => s.id)
            const endingOperations = ["rollback", "commit"]
            for (const seg of finalPathsWithinTransactionScope) {
              // The final segmentation must have (or have a parent that) called some ending operation in the transaction
              function traverse(seg) {
                const expressions = expressionsMap.get(seg)
                if (expressions && expressions.some(exp =>  endingOperations.includes((exp.property || {}).name))) {
                  return expressions.find(exp => endingOperations.includes((exp.property || {}).name))
                }
                if (idsWithTransactons.includes(seg.id)) {
                  return false
                }
                const s = seg.prevSegments[0]
                s.hook = seg.hook
                return traverse(s)
              }
              const callToClose = traverse(seg)
              if (!callToClose) {
                context.report({ node: codePathNode, message: `Transaction in this context is not closed at some path.`})
              }

            }

          },
          CallExpression: (node) => {
            const expressionMap = last(codePathExpressionMapStack);
            const codePathSegment = last(codePathSegmentStack);
            let expressions = expressionMap.get(codePathSegment);
            if (!expressions) {
              expressions = [];
              expressionMap.set(codePathSegment, expressions);
            }
            expressions.push(node.callee);
          },
        }
      },
    },
  },
};

function last(array) {
  return array[array.length - 1];
}
