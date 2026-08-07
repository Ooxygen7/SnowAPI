package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetUserTotalTopUpAmountCountsOnlySuccessfulOrders(t *testing.T) {
	originalDB := DB
	testDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = testDB
	t.Cleanup(func() { DB = originalDB })

	require.NoError(t, DB.AutoMigrate(&TopUp{}))
	require.NoError(t, DB.Create(&[]TopUp{
		{UserId: 7, Amount: 1200, TradeNo: "success-1", Status: common.TopUpStatusSuccess},
		{UserId: 7, Amount: 300, TradeNo: "success-2", Status: common.TopUpStatusSuccess},
		{UserId: 7, Amount: 900, TradeNo: "pending", Status: common.TopUpStatusPending},
		{UserId: 8, Amount: 5000, TradeNo: "other-user", Status: common.TopUpStatusSuccess},
	}).Error)

	total, err := GetUserTotalTopUpAmount(7)
	require.NoError(t, err)
	assert.Equal(t, int64(1500), total)
}
