module.exports = {
  rules: {
    transaction: {
      create(context) {
        const codePathExpressionMapStack = []
        const codePathSegmentStack = []
        return {
          // Maintain code segment path stack as we traverse.
          onCodePathSegmentStart: segment => codePathSegmentStack.push(segment),
          onCodePathSegmentEnd: () => codePathSegmentStack.pop(),

          // Maintain code path stack as we traverse.
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
            // shortestPathLengthToStart.cache = new Map();

            /**
             * Count the number of code paths from this segment to the end of the
             * function. For example:
             *
             * ```js
             * function MyComponent() {
             *   // Segment 1
             *   if (condition) {
             *     // Segment 2
             *   } else {
             *     // Segment 3
             *   }
             * }
             * ```
             *
             * Segments 2 and 3 have one path to the end of `MyComponent` and
             * segment 1 has two paths to the end of `MyComponent` since we could
             * either take the path of segment 1 or segment 2.
             *
             * Populates `cyclic` with cyclic segments.
             */

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
            // function shortestPathLengthToStart(segment) {
            //   const { cache } = shortestPathLengthToStart;
            //   let length = cache.get(segment.id);

            //   // If `length` is null then we found a cycle! Return infinity since
            //   // the shortest path is definitely not the one where we looped.
            //   if (length === null) {
            //     return Infinity;
            //   }

            //   // We have a cached `length`. Return it.
            //   if (length !== undefined) {
            //     return length;
            //   }

            //   // Compute `length` and cache it. Guarding against cycles.
            //   cache.set(segment.id, null);
            //   if (segment.prevSegments.length === 0) {
            //     length = 1;
            //   } else {
            //     length = Infinity;
            //     for (const prevSegment of segment.prevSegments) {
            //       const prevLength = shortestPathLengthToStart(prevSegment);
            //       if (prevLength < length) {
            //         length = prevLength;
            //       }
            //     }
            //     length += 1;
            //   }
            //   cache.set(segment.id, length);
            //   return length;
            // }
            // if not.
            // let shortestFinalPathLength = Infinity;
            // for (const finalSegment of codePath.finalSegments) {
            //   if (!finalSegment.reachable) {
            //     continue;
            //   }
            //   const length = shortestPathLengthToStart(finalSegment);
            //   if (length < shortestFinalPathLength) {
            //     shortestFinalPathLength = length;
            //   }
            // }

            const segmentsWithTransaction = []
            for (const [segment, expressions] of expressionsMap) {
              if (!segment.reachable) {
                continue;
              }

              // If there are any final segments with a shorter path to start then
              // we possibly have an early return.
              //
              // If our segment is a final segment itself then siblings could
              // possibly be early returns.

              // Count all the paths from the start of our code path to the end of
              // our code path that go _through_ this segment. The critical piece
              // of this is _through_. If we just call `countPathsToEnd(segment)`
              // then we neglect that we may have gone through multiple paths to get
              // to this point! Consider:
              //
              for (const hook of expressions) {
                if (hook.type === "MemberExpression"
                  && hook.object.name === "sequelize"
                  && hook.property.name === "transaction") {
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
            /*
            for (const seg of segmentsWithTransaction) {

              seg.allNextSegments
                  // .filter(seg => codePath.finalSegments.includes(seg))
                  .forEach(seg1 => {
                    // console.log("wtf", seg)
                    seg1.hook = seg.hook
                    segmentsWithTransaction.push(seg1)
                    const map = expressionsMap.get(seg1)
                    if (codePath.finalSegments.includes(seg1) && (!map || !map.some(exp => exp.property?.name === "rollback"))) {
                      context.report({ node: seg1.hook, message: `Transaction opened at line ${seg.hook?.loc.start.line} is not closed at some path.`})
                    }
                  })

            }
    */


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
          Identifier: node => {

          },
          FunctionDeclaration: (node) => {
            // if (!isInsideTransactioContext(node)) {

            // }
            // console.log("function")
          }
        }
      },
    },
  },
};

function last(array) {
  return array[array.length - 1];
}
