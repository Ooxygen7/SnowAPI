/*! LatticeLoader adapted from React Bits, Copyright (c) 2026 David Haz.
 * MIT + Commons Clause License Condition v1.0; full notice distributed at
 * /snow-shield-react-bits-license.txt and in REACT-BITS-LICENSE.txt. */
import type { CSSProperties } from 'react'

// Adapted from the user-provided React Bits LatticeLoader (orbit, 3x3).
// No timer is needed here: animation is CSS-only, including reduced motion.
const ORBIT = [0, 1, 2, 7, null, 3, 6, 5, 4]
const MARKS = { done: [2, 3, 5, 7], error: [0, 2, 4, 6, 8] }

export function LatticeLoader(props: {
  status: 'working' | 'done' | 'error'
  label: string
}) {
  const marks = props.status === 'error' ? MARKS.error : MARKS.done
  return (
    <span className='lattice-loader' data-status={props.status}>
      <span className='lattice-loader__grid' aria-hidden='true'>
        <span className='lattice-loader__layer lattice-loader__run'>
          {ORBIT.map((unit) => (
            <span
              key={unit ?? 'center'}
              className='lattice-loader__cell'
              data-hole={unit === null ? '' : undefined}
              style={
                unit === null
                  ? undefined
                  : ({
                      animationDelay: `${Math.round(unit * 108)}ms`,
                    } as CSSProperties)
              }
            />
          ))}
        </span>
        <span className='lattice-loader__layer lattice-loader__mark'>
          {ORBIT.map((unit, index) => (
            <span
              key={unit ?? 'center'}
              className='lattice-loader__cell'
              data-on={marks.includes(index) ? '' : undefined}
            />
          ))}
        </span>
      </span>
      <span className='lattice-loader__label'>{props.label}</span>
    </span>
  )
}
