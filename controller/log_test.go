package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseLogTypes(t *testing.T) {
	tests := []struct {
		name      string
		raw       string
		expected  []int
		wantError bool
	}{
		{name: "empty keeps legacy type behavior", raw: "", expected: nil},
		{name: "consume view", raw: "2,5", expected: []int{2, 5}},
		{name: "billing view", raw: "1,6", expected: []int{1, 6}},
		{name: "other view includes unknown", raw: "0,3,4,7", expected: []int{0, 3, 4, 7}},
		{name: "duplicates are removed", raw: "2, 5,2", expected: []int{2, 5}},
		{name: "rejects malformed values", raw: "2,error", wantError: true},
		{name: "rejects out of range values", raw: "8", wantError: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := parseLogTypes(test.raw)
			if test.wantError {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, test.expected, actual)
		})
	}
}
